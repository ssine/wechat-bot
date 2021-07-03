import {Std52Card as Card, Std52Poker} from './std52poker'
import { Wechaty, Message, Contact } from 'wechaty'
import {
  Account, CoinConfig, getDispName,
  sleep, filterAsync, shuffle
} from './account_utils'

enum Hand_Rank {H, P, F, S, T, SF}
const Hand_Rank_Name : string[] = ["高牌", "对子", "同花", "顺子", "三条", "同花顺"];
const Pair_Plus_Bonus : Record<Hand_Rank, number> = {
  [Hand_Rank.H] : 0,
  [Hand_Rank.P] : 3,
  [Hand_Rank.F] : 6,
  [Hand_Rank.S] : 10,
  [Hand_Rank.T] : 30,
  [Hand_Rank.SF] : 40,
}

const Ante_Bonus : Record<Hand_Rank, number> = {
  [Hand_Rank.H] : 0,
  [Hand_Rank.P] : 1,
  [Hand_Rank.F] : 2,
  [Hand_Rank.S] : 3,
  [Hand_Rank.T] : 4,
  [Hand_Rank.SF] : 5,
}

/*
Straight flush  Three suited cards in sequence  48  0.22%
Three of a kind  Three cards of same rank  52  0.24%
Straight  Three cards in sequence  720  3.26%
Flush  Three suited cards  1,096  4.96%
Pair  Two cards of same rank  3,744  16.94%
High card  None of the above  16,440  74.39%
*/

class ThreeCardPoker extends Std52Poker{
  deal(){
    return super.deal(3);
  }
}

class TCPRank{
  static hand_rank(hand: Card[]){
      if(hand.length != 3){
        return -1
      }

      hand.sort((card1:Card, card2:Card) =>{ return card2.value - card1.value}); // Descending order

      let is_flush: boolean = false;
      let is_straight: boolean = false;

      if(hand[0].value == hand[1].value + 1 && hand[1].value == hand[2].value + 1){
        is_straight = true;
      }
      else if (hand[0].value == 12 && hand[1].value == 1 && hand[2].value == 0){
        let swap = hand[1].value;
        hand[1].value = hand[2].value;
        hand[2].value = swap;
        is_straight = true;
      }

      if(hand[0].suit == hand[1].suit && hand[1].suit == hand[2].suit){
        is_flush = true;
      }

      if (is_straight && is_flush){
        return Hand_Rank.SF;
      }

      if(hand[0].value == hand[1].value && hand[1].value == hand[2].value){
        return Hand_Rank.T;
      }

      if (is_straight){
        return Hand_Rank.S;
      }

      if(is_flush){
        return Hand_Rank.F;
      }

      if(hand[0].value == hand[1].value){
        return Hand_Rank.P;
      }

      if(hand[1].value == hand[2].value){  // ABB -> BBA
        let top: Card = hand[0];
        hand[0] = hand[2];
        hand[2] = top;
        return Hand_Rank.P;
      }

      return Hand_Rank.H;
  }
  static compare(a:Card[], b:Card[]){
    let hr_a = this.hand_rank(a);
    let hr_b = this.hand_rank(b);
    if(hr_a > hr_b){
      return 1;
    }
    if (hr_b > hr_a){
      return -1;
    }
    for(let i = 0; i < 3; i++){
      if (a[i].value > b[i].value){
        return 1;
      }
      if (a[i].value < b[i].value){
        return -1;
      }
    }
    return 0;
  }
}






function testTcpRank(){

  let tcp = new ThreeCardPoker();
  let a = tcp.deal();
  let b = tcp.deal();
  console.log("hand_rank of a")
  console.log(Hand_Rank_Name[TCPRank.hand_rank(a)]);
  console.log("a");
  for (let x of a){
  x.print();
  }

  console.log("hand_rank of b")
  console.log(Hand_Rank_Name[TCPRank.hand_rank(b)]);

  console.log("b");
  for (let x of b){
  x.print();
  }

  console.log("compare a b")
  console.log(TCPRank.compare(a,b));
}

class TcpState {
  contact: Contact
  username: string
  ante: number
  pair_plus: number
  hand: Array<Card>
  rank: Hand_Rank
  play: boolean
  ever_play : boolean

  constructor(contact : Contact, username : string, ante: number, pair_plus: number = 0, hand : Array<Card> = [] as Card[], rank:Hand_Rank = Hand_Rank.H, play:boolean = true, ever_play:boolean = false){
    this.contact = contact;
    this.username = username;
    this.ante = ante;
    this.pair_plus = pair_plus;
    this.hand = hand;
    this.rank = rank;
    this.play = play;
    this.ever_play = ever_play;
  }
}


type SMInfo = {
  if_shuffle: boolean,
  resp :string
}

class TCPGame{
  bot: Wechaty
  accounts: Record<string, Account>
  poker: ThreeCardPoker
  rank: TCPRank
  max_player: number
  shuffling_threshold:number
  no_shuffle: boolean

  constructor(bot: Wechaty, max_player: number = 8, no_shuffle: boolean = true, shuffling_threshold: number = 0) {
    this.bot = bot
    this.poker = new ThreeCardPoker()
    this.max_player = max_player
    this.shuffling_threshold = shuffling_threshold
    this.no_shuffle = no_shuffle
  }

  //不洗牌机制
  no_shuffling_mechanism(cost: number = 0):SMInfo{
    if(!this.no_shuffle){
      this.poker.restart();
      return {
        if_shuffle:true,
        resp:"不洗牌模式未开启，每局自动洗牌"
      };
    }
    let baseline = cost + this.shuffling_threshold;
    let resp = "余牌"+ this.poker.remainder()+"张";
    if (baseline > this.poker.remainder()){
      this.poker.restart();
      resp += ",不足"+baseline+"张, 洗牌"
      return {
        if_shuffle:true,
        resp:resp
      };
    }
    else {
      resp += ",余牌充足，不洗牌";
      return {
        if_shuffle:false,
        resp: resp
      };
    }
  }

  async run(msg: Message, accounts: Record<string, Account>){
    this.accounts = accounts;
    const room = msg.room();
    let state = new Map<string, TcpState>();
    await msg.say(`Three Poker Card:
1.游戏模式: 玩家间不竞争, 下注跟庄家比，押宝单算
2.游戏流程: 下注与押宝 -> 决定是否跟注 -> 结算
3.大小关系：同花顺 > 三条 > 顺子 > 同花 > 对子 > 高牌
4.额外奖金: 对子以上无论输赢。押宝赔率更高!
`
    )
    await msg.say('输入「来 x」下注 xB 默认1, 押宝0。\n输入「来 x y」下注xB，押宝 yB \n输入「宝 y」押宝yB 默认1, 下注1。\n 下请开始输入：')
    const lai = "来";
    const bao = "宝";
    const ante = async (m: Message) => {
    if (m.room()?.id === room.id && (m.text().includes(lai)||m.text().includes(bao))) {

        if (state.size >= this.max_player){
          m.say(`${await getDispName(m.talker(), room)} 无效，已达到最高人数${this.max_player}`);
          return;
        }
        const act = await this.getAccount(m.talker().id)
        if (state.has(m.talker().id)) {
          m.say(`${await getDispName(m.talker(), room)} 无效，您已加入`)
          return
        }

        let is_lai = false; //lai: true, bao: false

        if(m.text().includes(lai)){
          is_lai = true; //lai overwrite bao
        }

        let number_strings= m.text().replace(/[^\d.]/g," ").trim().split(/\s+/);
        let ante = 1;
        let pair_plus = 0;

        if(is_lai){
          if(number_strings.length  == 1){
            ante = parseFloat(/\d+(\.\d+)?/.exec(number_strings[0])?.[0]) || 1;
          }
          else if (number_strings.length >1){
            ante = parseFloat(/\d+(\.\d+)?/.exec(number_strings[0])?.[0]) || 1;
            pair_plus = parseFloat(/\d+(\.\d+)?/.exec(number_strings[1])?.[0]) || 0;
          }
        }
        else {  //bao
            pair_plus = parseFloat(/\d+(\.\d+)?/.exec(number_strings[0])?.[0]) || 1;
        }

        /*
        console.log("ANTE AND PAIR PLUS")
        console.log(ante)
        console.log(pair_plus)
        */
        if (ante < 1) {
          m.say(`${await getDispName(m.talker(), room)} 无效，最少押注1B`);
          return;
        }
        if (act.balance < 2 * ante + pair_plus) {
          m.say(`${await getDispName(m.talker(), room)} 余额为${act.balance}B, 不足${2 * ante + pair_plus}B ，无法加入`);
          return;
        }

        act.balance -= 2 * ante + pair_plus;
        let username = await getDispName(m.talker(), room);
        state.set(m.talker().id, new TcpState(
          m.talker(),
          username,
          ante,
          pair_plus
        ));
        const idx = state.size;
        await m.say(`${idx}. ${username} 成功加入，下注 ${ante}B, 押宝${pair_plus}B`)
      }
    }
    this.bot.on('message', ante)

    await sleep(20000)
    //await sleep(5000)

    this.bot.off('message', ante)

    const total = state.size;
    if (total === 0) {
      await msg.say('20秒无玩家加入，游戏结束。')
      return
    }

    let resp = "";
    let nsm_res = this.no_shuffling_mechanism((state.size + 1)*3);

    resp += nsm_res.resp+"\n\n";
    resp += '发牌\n\n'
    for (let [key, s] of state) {
      resp += s.username + ": ";
      s.hand = this.poker.deal();
      s.rank = TCPRank.hand_rank(s.hand);
      for (let c of s.hand){
        resp += c.get_string()+" "
      }
      resp += Hand_Rank_Name[s.rank];
      resp += "\n";
    }
    resp += "\nDealer: 🎴🎴🎴  \n\n是否跟注？[y/n] (默认y跟注, 支付同倍下注)"
    await msg.say(resp);

    const yes = "y"
    const no = "n"
    const play = async (m: Message) => {
      if (m.room()?.id === room.id) {
        let wanna_play = true;
        if (m.text().toLowerCase().includes(yes)){
        }
        else if (m.text().toLowerCase().includes(no)){
          wanna_play = false;
        }
        else {
          return;
        }

        if (!state.has(m.talker().id)) {
          m.say(`${await getDispName(m.talker(), room)} 无效，您未参与游戏，请参加下一轮`)
          return
        }
        const act = await this.getAccount(m.talker().id)
        let s = state.get(m.talker().id);
        if(s.ever_play){
          return;
        }
        s.ever_play = true;
        let play_resp = ""

        if(wanna_play){
          play_resp += "决定跟注" + s.ante+"B";
        } else {
          act.balance += s.ante;
          play_resp += "决定弃牌及时止损";
        }
        s.play = wanna_play;
        await m.say(`${s.username} ${play_resp}`);
      }
    }
    this.bot.on('message', play)

    await sleep(20000)
    //await sleep(5000)
    this.bot.off('message', play)

    resp = "牌面\n\n";
    for (let [key, s] of state) {
      resp += s.username + ": ";
      for (let c of s.hand){
        resp += c.get_string()+" "
      }
      resp += Hand_Rank_Name[s.rank];
      if(s.play){
        resp +=" [play]"
      } else{
        resp +=" [quit]"
      }
      resp += "\n";
    }
    let dealer_hand = this.poker.deal();
    let dealer_rank = TCPRank.hand_rank(dealer_hand);
    let dealer_qualified = true;
    if(dealer_rank == Hand_Rank.H && dealer_hand[0].value < 10 ) // 10:Q
    {
      dealer_qualified = false;
    }

    resp += "\nDealer: "
    for (let c of dealer_hand){
      resp += c.get_string()+" "
    }
    resp += Hand_Rank_Name[dealer_rank];

    resp +="\n"
    if(!dealer_qualified){
      resp += "\n庄家牌太差(小于高牌Q)，只赔一半 \n";
    }

    resp += "\n结算\n\n";

    for (let [key, s] of state) {
      if(s.play){
        resp += s.username + ": ";
        let res = TCPRank.compare(s.hand, dealer_hand);
        let act = await this.getAccount(key);
        let pair_plus_bonus = Pair_Plus_Bonus[s.rank];
        let ante_bonus = Ante_Bonus[s.rank];
        let bonus = pair_plus_bonus * s.pair_plus + ante_bonus * s.ante;
        act.balance += bonus;
        if(res == 0){
          act.balance += s.ante * 2 + s.pair_plus;
          resp += "Tie and push, 净收益: "+bonus + "B";
        }
        else if (res < 0) // dealer win
        {
          resp += "Lose, 净收益: " + (bonus - s.ante * 2 - s.pair_plus) + "B";
        }
        else {
          let reward : number = 0;
          if(dealer_qualified){
            reward = s.ante * 4;
          }
          else{
            reward = s.ante * 3;
          }
          act.balance += reward;
          resp += "Win, 净收益: " + (reward + bonus - 2 * s.ante - s.pair_plus) +"B";
        }
      } else {
        resp += s.username + ": Quit, 净收益: -"+ (s.ante + s.pair_plus )+ "B";
      }
      resp += "\n";
    }

    let ever_pp = false;
    for (let [key, s] of state) {
      if(s.play){
        let pair_plus_bonus = Pair_Plus_Bonus[s.rank];
        let ante_bonus = Ante_Bonus[s.rank];
        let bonus = pair_plus_bonus * s.pair_plus + ante_bonus * s.ante;
        if(bonus){
          if(!ever_pp){
            resp += "\n\n恭喜以下几个B中宝!\n\n"
            ever_pp = true;
          }
          resp += s.username + ": " +Hand_Rank_Name[s.rank] + " " + bonus+"B\n";
          resp += "["
          if(pair_plus_bonus){
            resp += pair_plus_bonus + " * 押宝(" + s.pair_plus + ")";
          }
          if(ante_bonus){
            resp += " + " +  ante_bonus + " * 下注(" + s.ante +")" ;
          }
          resp += "]\n"
        }
      }
    }
    if(!ever_pp){
      resp += "\n\n无人中宝\n\n"
    }
    await msg.say(resp);
    return;
  }

  async getAccount(wxid: string) {
    if (!this.accounts[wxid]) {
      this.accounts[wxid] = {
        balance: 30
      }
    }
    return this.accounts[wxid]
  }

}

export {
  TCPGame
}


//testTcpRank();
