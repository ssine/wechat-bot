import {Std52Card as Card, Std52Poker} from './std52poker'
import { Wechaty, Message, Contact } from 'wechaty'
import {
  Account, CoinConfig, getDispName,
  sleep, filterAsync, shuffle
} from './account_utils'

enum Hand_Rank {H, P, F, S, T, SF}
const Hand_Rank_Name : string[] = ["High", "Pair", "Flush","Straight", "Three of a Kind", "Straight Flush"];

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
      else if (hand[0].value == 12 && hand[1].value == 0 && hand[2].value == 1){
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

type TcpState = {
  contact: Contact
  username: string
  ante: number
  hand: Card[]
  rank: Hand_Rank
  play: number
}

class TCPGame{
  bot: Wechaty
  accounts: Record<string, Account>
  poker: ThreeCardPoker
  rank: TCPRank
  max_player: number

  constructor(bot: Wechaty, max_player: number = 8) {
    this.bot = bot
    this.poker = new ThreeCardPoker()
    this.max_player = max_player
  }

  async run(msg: Message, accounts: Record<string, Account>){
    this.accounts = accounts;
    const room = msg.room();
    this.poker.restart();
    let state = new Map<string, any>();
    await msg.say('Three Poker Card: \n \
1.游戏模式: 赢过庄家(Dealer)即算赢 玩家间不竞争\n \
2.游戏流程：第一次下注(ante)看牌 -> 决定是否第二次下注(play) -> 结算\n \
3.大小关系：同花顺 > 三条 > 顺子 > 同花 > 一对 > 高牌 \n \
4.收益结算：小于庄0，等于庄家退还，大于庄家两种情况: \n \
如果庄大于等于[Q高牌],则称庄家Qualified，1:1 赔付 ante + play \n \
Unqualified 仅1:1 赔付 ante'
    )
    await msg.say('输入「来 x」付出 xB ante进行挑战，默认1。请开始输入：')
    const ante = async (m: Message) => {
      if (m.room()?.id === room.id && m.text().includes('来')) {
        if (state.size >= this.max_player){
          m.say(`${await getDispName(m.talker(), room)} 无效，已达到最高人数${this.max_player}`);
          return;
        }
        const act = await this.getAccount(m.talker().id)
        if (state.has(m.talker().id)) {
          m.say(`${await getDispName(m.talker(), room)} 无效，您已加入`)
          return
        }
        const amount = parseFloat(/\d+(.\d+)?/.exec(m.text())?.[0]) || 1
        if (amount < 1) {
          m.say(`${await getDispName(m.talker(), room)} 无效，最少押注1B`);
          return;
        }
        if (act.balance < 2 * amount) {
          m.say(`${await getDispName(m.talker(), room)} 余额不足2倍ante, 即${amount}B ，无法加入`);
          return;
        }
        act.balance -= amount;
        let username = await getDispName(m.talker(), room);
        state.set(m.talker().id, {
          contact: m.talker(),
          username: username,
          ante: amount,
          play: -1
        });
        const idx = state.size;
        await m.say(`${idx}. ${username} 成功加入，押 ${amount}B`)
      }
    }
    this.bot.on('message', ante)

    await sleep(20000)
    this.bot.off('message', ante)

    const total = state.size;
    if (total === 0) {
      await msg.say('20秒无玩家加入，游戏结束。')
      return
    }

    let resp = '发牌\n\n'
    for (let [key, s] of state) {
      resp += s.username + ": ";
      s.hand = this.poker.deal();
      for (let c of s.hand){
        resp += c.get_string()+" "
      }
      s.rank = TCPRank.hand_rank(s.hand);
      resp += Hand_Rank_Name[s.rank];
      resp += "\n";
    }
    resp += "\nDealer: 🎴🎴🎴  \n\n是否继续play？[y/n] 是则自动ante同等下注，否则弃牌(默认)"
    await msg.say(resp);

    const play = async (m: Message) => {
      if (m.room()?.id === room.id) {
        let wanna_play : number = 0;
        if (m.text().includes('y')|| m.text().includes('Y')){
          wanna_play = 1;
        }
        else if (m.text().includes('n')|| m.text().includes('N')){
          ;
        }
        else {
          return;
        }
        const act = await this.getAccount(m.talker().id)
        if (!state.has(m.talker().id)) {
          m.say(`${await getDispName(m.talker(), room)} 无效，您未下注ante`)
          return
        }
        let s = state.get(m.talker().id);
        if(s.play == 0 || s.play == 1){
          return; // have decided to play or not
        }
        let play_resp = ""
        if(wanna_play){
          act.balance -= s.ante;
          play_resp += "决定继续游戏且再押入" + s.ante+"B";
        } else {
          play_resp += "决定弃牌及时止损";
        }
        s.play = wanna_play;
        await m.say(`${s.username} ${play_resp}`);
      }
    }
    this.bot.on('message', play)

    await sleep(20000)
    this.bot.off('message', play)

    resp = "牌面\n\n";
    for (let [key, s] of state) {
      resp += s.username + ": ";
      for (let c of s.hand){
        resp += c.get_string()+" "
      }
      resp += Hand_Rank_Name[s.rank];
      if(s.play == 1){
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
    if(dealer_qualified){
      resp += " [Qualified]\n";
    }
    else{
      resp += " [Unqualified]\n";
    }

    console.log(state);
    resp += "\n结算\n\n";

    for (let [key, s] of state) {
      if(s.play == 1){
        resp += s.username + ": ";
        let res = TCPRank.compare(s.hand, dealer_hand);
        let act = await this.getAccount(key);
        if(res == 0){
          act.balance += s.ante * 2
          resp += "Tie and push, 收益: "+ s.ante * 2 + "B\n";
        }
        else if (res < 0) // dealer win
        {
          resp += "Loss, 收益: 0\n";
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
          resp += "Win, 收益: " +reward +"B";
        }
      }
      resp += "\n";
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
