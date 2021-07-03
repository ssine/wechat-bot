import {Std52Card as Card, Std52Poker} from './std52poker'
import { Wechaty, Message, Contact } from 'wechaty'
import {
 Account, CoinConfig, getDispName,
 sleep, filterAsync, shuffle
} from './account_utils'

enum FCP_Hand_Rank {H, P, TP, TK, S, F,FH, FK, SF, RF}
const FCP_Hand_Rank_Name : string[] = ["高牌", "对子","两对","三条" ,"顺子","同花", "葫芦", "四条", "同花顺","皇家同花顺"];

class FiveCardPoker extends Std52Poker{
  deal5(){
    return super.deal(5);
  }
}

class FCPRank{
  static hand_rank(hand: Card[]){
      if(hand.length != 5){
        return -1
      }

      //hand.sort((card1:Card, card2:Card) =>{ return card2.value - card1.value}); // Descending order

      let card_counter = new Map<number, Card[] >();
      for(let h of hand){
        if(card_counter.has(h.value)){
          card_counter.get(h.value).push(h);
        }
        else {
          card_counter.set(h.value, [h] as Card[]);
        }
      }

      let ranked_counter  = [...card_counter].sort((a, b) =>{ //Descending
        let res1 = b[1].length - a[1].length;
        if (!res1){
          return b[0] - a[0];
        }
        return res1;
       }).map(x=>x[1]);  // [Card[], Card[], Card[]]


      hand.length = 0; //clear hand
      for(let cards of ranked_counter){
        cards.forEach(card => hand.push(card))
      }

      let is_flush: boolean = true;
      let is_straight: boolean = true;

      for(let i = 0; i< 4; i++){
        if(hand[i].value != hand[i+1].value+1){
          is_straight = false;
          break;
        }
      }

      // A2345
      if (hand[0].value == 12 && hand[1].value == 3 && hand[2].value == 2 && hand[3].value== 1 && hand[4].value == 0){
        hand[0].value = 3;
        hand[1].value = 2;
        hand[2].value = 1;
        hand[3].value = 0;
        hand[4].value = 12;
        is_straight = true;
      }

      for(let i = 0; i< 4; i++){
        if(hand[i].suit != hand[i+1].suit){
          is_flush = false;
          break;
        }
      }

      if (is_straight && is_flush){
        return FCP_Hand_Rank.SF;
      }


      if(ranked_counter[0].length == 4){
        return FCP_Hand_Rank.FK
      }


      if(ranked_counter[0].length == 3 && ranked_counter[1].length == 2){
        return FCP_Hand_Rank.FH
      }

      if(is_flush){
        return FCP_Hand_Rank.F;
      }

      if (is_straight){
        return FCP_Hand_Rank.S;
      }

      if(ranked_counter[0].length == 3){
        return FCP_Hand_Rank.TK;
      }

      if(ranked_counter[0].length == 2 && ranked_counter[1].length == 2 ){
        return FCP_Hand_Rank.TP;
      }

      if(ranked_counter[0].length == 2){
        return FCP_Hand_Rank.P;
      }

      return FCP_Hand_Rank.H;
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
    for(let i = 0; i < 5; i++){
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






function testFCPRank(){

  let fcp = new FiveCardPoker();

  // let a = fcp.deal5();

  let a = [ new Card(0,12), new Card(0,11),new Card(0,10), new Card(0,9),new Card(0,8) ]
  console.log("hand_rank of a")
  console.log(FCP_Hand_Rank_Name[FCPRank.hand_rank(a)]);
  console.log("a");
  for (let x of a){
    x.print();
  }

  // let b = fcp.deal5();
  let b = [new Card(1,12), new Card(0,11),new Card(0,10), new Card(0,9),new Card(0,8)]
  console.log("hand_rank of b")
  console.log(FCP_Hand_Rank_Name[FCPRank.hand_rank(b)]);

  console.log("b");
  for (let x of b){
    x.print();
  }

  console.log("compare a b")
  console.log(FCPRank.compare(a,b));
}

//testFCPRank();

class FcpState {
  contact: Contact
  username: string
  ante: number
  change: number
  change_card_ids: Array<number>
  hand: Array<Card>
  rank: FCP_Hand_Rank
  ever_change: boolean

  constructor(contact : Contact, username : string, ante: number, change: number = 0, change_card_ids: Array<number> = [], hand : Array<Card> = [] as Card[], rank:FCP_Hand_Rank = FCP_Hand_Rank.H, ever_change: boolean = false){
    this.contact = contact;
    this.username = username;
    this.ante = ante;
    this.change = change;
    this.hand = hand;
    this.rank = rank;
    this.change_card_ids = change_card_ids;
    this.ever_change = ever_change;
  }
}


type SMInfo = {
  if_shuffle: boolean,
  resp :string
}

class FCPGame{
  bot: Wechaty
  accounts: Record<string, Account>
  poker: FiveCardPoker
  rank: FCPRank
  max_player: number
  shuffling_threshold:number
  no_shuffle: boolean
  change_rate:number

  constructor(bot: Wechaty, no_shuffle: boolean = true, shuffling_threshold: number = 10, max_player: number = 5, change_rate: number = 1 ) {
    this.bot = bot
    this.poker = new FiveCardPoker()
    this.max_player = max_player
    this.shuffling_threshold = shuffling_threshold
    this.no_shuffle = no_shuffle
    this.change_rate = change_rate
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

  async run(msg: Message, accounts: Record<string, Account>, text:string){
    this.accounts = accounts;
    const room = msg.room();
    let state = new Map<string, FcpState>();
    let blind = parseFloat(/\d+(\.\d+)?/.exec(text)?.[0]) || 1;
    let pot = 0;
    await msg.say(`决斗:

1.游戏模式: 多人吃鸡模式
2.游戏流程: 前注 -> 加注换牌 -> 结算
3.大小关系: 同花顺 > 四条 > 葫芦 > 同花 > 顺子 > 三条 > 两对 > 对子 > 高牌
4.换牌: 换X张需要再加注X倍前注
5.设置前注: 启动游戏时 @机器人 决斗 「前注金额」


本局游戏 前注大小为:${blind}B
输入「来」下注加入游戏
`
    )
    const lai = "来";
    const ante = async (m: Message) => {
      if (m.room()?.id === room.id && (m.text().includes(lai))){

        if (state.size >= this.max_player){
          m.say(`${await getDispName(m.talker(), room)} 无效，已达到最高人数${this.max_player}`);
          return;
        }
        const act = await this.getAccount(m.talker().id)
        if (state.has(m.talker().id)) {
          m.say(`${await getDispName(m.talker(), room)} 无效，您已加入`)
          return
        }

        if (act.balance < blind) {
          m.say(`${await getDispName(m.talker(), room)} 余额为${act.balance}B, 不足${blind}B ，无法加入`);
          return;
        }

        act.balance -=  blind;
        pot += blind;
        let username = await getDispName(m.talker(), room);
        state.set(m.talker().id, new FcpState(
          m.talker(),
          username,
          blind
        ));
        const idx = state.size;
        await m.say(`${idx}. ${username} 成功加入，下注 ${blind}B。
当前奖池金额为${pot}`)
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
    let nsm_res = this.no_shuffling_mechanism((state.size)*10);

    resp += nsm_res.resp+"\n\n";
    resp += '发牌\n\n'
    for (let [key, s] of state) {
      resp += s.username + ": ";
      s.hand = this.poker.deal5();
      s.rank = FCPRank.hand_rank(s.hand);
      resp += FCP_Hand_Rank_Name[s.rank] + "\n";
      for (let c of s.hand){
        resp += c.get_string()+" "
      }
      resp += "\n";
    }
    resp += "\n 输入 「换 x y z ....」换掉第x,y,z张牌, 每换一张牌需要" + blind +"B。(第一张牌为1)"
    await msg.say(resp);

    const huan = "换"
    const change = async (m: Message) => {
      if (m.room()?.id === room.id && (m.text().includes(huan))){
        if (!state.has(m.talker().id)) {
          m.say(`${await getDispName(m.talker(), room)} 无效，您未参与游戏，请参加下一轮`)
          return
        }

        let s = state.get(m.talker().id);
        if(s.ever_change){
          return;
        }

        let number_strings= m.text().replace(/[^\d]/g," ").trim().split(/\s+/);
        let number_length = Math.min(5, number_strings.length);
        let change_card_ids = new Set<number>();
        for(let i = 0; i< number_length; i++){
          let id = parseFloat(/\d/.exec(number_strings[i])?.[0]) || -1;
          if(id < 1 || id > 5 ){
            m.say(`${await getDispName(m.talker(), room)} 输入换牌序号格式有误，请检查是否为1-5`)
            return;
          }
          change_card_ids.add(id-1);
        }


        const act = await this.getAccount(m.talker().id);
        let change_cost = change_card_ids.size * blind * this.change_rate;

        if (act.balance < change_cost) {
          let most = Math.floor(act.balance/ blind)
          m.say(`${await getDispName(m.talker(), room)} 换牌失败 余额为${act.balance}B, 不足${change_cost}B ，最多换${most}张`);
          return;
        }

        s.ever_change = true;

        s.change = change_cost;
        s.change_card_ids = [...change_card_ids].sort((a,b) => a-b);
        act.balance -= s.change;
        pot += s.change;


        let change_id_string = "";

        for(let i = 0; i< s.change_card_ids.length - 1; ++i){

          change_id_string += (s.change_card_ids[i]+1) +" ";
        }

        change_id_string += (s.change_card_ids[s.change_card_ids.length-1]+1);


        await m.say(`${s.username} 成功下注 ${s.change}B  即将换掉第${change_id_string}张牌。
当前奖池金额为${pot}`);
      }
    }
    this.bot.on('message', change)

    await sleep(20000)
    //await sleep(5000)
    this.bot.off('message', change)

    resp = "牌面\n\n";
    for (let [key, s] of state) {
      resp += s.username + ": ";

      for(let i of s.change_card_ids){
        s.hand[i] = this.poker.deal()[0];
      }
      s.rank = FCPRank.hand_rank(s.hand);
      resp += FCP_Hand_Rank_Name[s.rank]+'\n';
      for (let c of s.hand){
        resp += c.get_string()+" "
      }
      resp += "\n";
    }

    resp += "\n结算\n";


    resp += "\n总奖池大小为"+ pot + "\n";

    let ranked_state = [...state].sort((a,b)=> FCPRank.compare(b[1].hand, a[1].hand)) // Descending


    let champion_keys = new Set<string>();
    let runnerup_keys = new Set<string>();

    champion_keys.add(ranked_state[0][0]);
    let champion_names =ranked_state[0][1].username;
    let runnerup_names = "";

    let runner_up_start = ranked_state.length;
    for(let i = 1 ; i< ranked_state.length; ++i){
      let res = FCPRank.compare(ranked_state[i-1][1].hand, ranked_state[i][1].hand);
      if(res == 0){
        champion_keys.add(ranked_state[i][0])
        champion_names+=ranked_state[i][1].username + " ";
      }
      else {
        runnerup_keys.add(ranked_state[i][0])
        runnerup_names+=ranked_state[i][1].username + " ";
        runner_up_start = i;
        break;
      }
    }

    for(let i = 1 + runner_up_start ; i< ranked_state.length; ++i){
      let res = FCPRank.compare(ranked_state[i-1][1].hand, ranked_state[i][1].hand);
      if(res == 0){
        runnerup_keys.add(ranked_state[i][0])
        runnerup_names+=ranked_state[i][1].username + " ";
      }
      else {
        break;
      }
    }


    for(let r of runnerup_keys){
      pot -= state.get(r).change;
    }

    let div_pot = Math.floor((pot/champion_keys.size)*100)/100;

    resp += `\n恭喜 ${champion_names} 成功吃鸡！ 赢家收获 ${div_pot}B\n\n`;
    resp += `\n恭喜 ${runnerup_names} 成功喝汤！ 返还换牌钱\n\n`;

    resp += "全体收益细则:\n\n";

    for(let [key, s] of state){
      resp += s.username + ": ";
      let act = await this.getAccount(key);
      if(champion_keys.has(key)){
        act.balance += div_pot
        resp += "Win 净收益: "+(div_pot - s.ante - s.change) + "B";
      }
      else if(runnerup_keys.has(key)){
        act.balance += s.change
        resp += "Win 净收益: "+(- s.ante) + "B";
      }
      else
      {
        resp += "Lose, 净收益: " + (- s.ante  - s.change) + "B";
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
  FCPGame
}


