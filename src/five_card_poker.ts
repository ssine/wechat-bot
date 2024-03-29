import {Std52Card as Card, Std52Poker} from './std52poker'
import { Wechaty, Message, Contact } from 'wechaty'
import {
 Account, CoinConfig, getDispName,
 sleep, filterAsync, shuffle
} from './account_utils'

enum FCP_Hand_Rank {H, P, TP, TK, S, F,FH, FK, SF, RF}
const FCP_Hand_Rank_Name : string[] = ["高牌", "对子","两对","三条" ,"顺子","同花", "葫芦", "四条", "同花顺","皇家同花顺"];

const FCP_Bonus_Odds : Record<FCP_Hand_Rank, number> = {
  [FCP_Hand_Rank.H] : 0,
  [FCP_Hand_Rank.P] : 0,
  [FCP_Hand_Rank.TP] : 0.5,
  [FCP_Hand_Rank.TK] : 1,
  [FCP_Hand_Rank.S] : 2,
  [FCP_Hand_Rank.F] : 3,
  [FCP_Hand_Rank.FH] : 5,
  [FCP_Hand_Rank.FK] : 30,
  [FCP_Hand_Rank.SF] : 600,
  [FCP_Hand_Rank.RF] : 5000,
}

/*

1/p =

  P : 2.366,
  TP : 21,
  TK : 47.33,
  S : 254.8,
  F : 509.8,
  FH : 694.2,
  FK : 4166,
  SF : 72193.333,
  RF : 649,749,
*/

class FiveCardPoker extends Std52Poker{
  deal_hand(){
    return super.deal(6);
  }
}

class FCPRank{
  static hand_rank(hand: Card[]){
      if(hand.length != 6){
        return -1
      }

      //hand.sort((card1:Card, card2:Card) =>{ return card2.value - card1.value}); // Descending order


      let value_counter = new Map<number, Card[] >();
      for(let h of hand){
        if(value_counter.has(h.value)){
          value_counter.get(h.value).push(h);
        }
        else {
          value_counter.set(h.value, [h] as Card[]);
        }
      }

      let ranked_value_counter  = [...value_counter].sort((a, b) =>{ //Descending
        let res1 = b[1].length - a[1].length;
        if (!res1){
          return b[0] - a[0];
        }
        return res1;
       }).map(x=>x[1]);  // [Card[], Card[], Card[]]


      hand.length = 0; //clear hand

      for(let cards of ranked_value_counter){
        cards.forEach(card => hand.push(card))
      }



      let is_straight_vec : Array<boolean> = [true, true, false];
      let is_flush_vec : Array<boolean> = [true, true, false];

      for(let i = 0; i< 4; i++){
        if(hand[i].value != hand[i+1].value+1){
          is_straight_vec[0] = false;
          break;
        }
      }

      for(let i = 0; i< 4; i++){
        if(hand[i].suit != hand[i+1].suit){
          is_flush_vec[0] = false;
          break;
        }
      }

      for(let i = 1; i< 5; i++){
        if(hand[i].value != hand[i+1].value+1){
          is_straight_vec[1] = false;
          break;
        }
      }

      for(let i = 1; i< 5; i++){
        if(hand[i].suit != hand[i+1].suit){
          is_flush_vec[1] = false;
          break;
        }
      }

      if (hand[0].value == 12 && hand[hand.length-4].value == 3 && hand[hand.length-3].value == 2 && hand[hand.length-2].value== 1 && hand[hand.length-1].value == 0){
        is_straight_vec[2] = true;
      }

      if (hand[0].suit ==  hand[hand.length-4].suit &&
         hand[hand.length-4].suit ==  hand[hand.length-3].suit &&
         hand[hand.length-3].suit ==  hand[hand.length-2].suit &&
         hand[hand.length-2].suit ==  hand[hand.length-1].suit){
        is_flush_vec[2] = true;
      }



     // A.RF > A.SF > B.SF > C.SF > FK> FH > F>  A.S > B.S >C.S

     if(is_straight_vec[0] && is_flush_vec[0]){ //AbcdeX
         if(hand[0].value == 12){
            return FCP_Hand_Rank.RF;
         }
         else {
            return FCP_Hand_Rank.SF;
         }
     }

     if(is_straight_vec[1] && is_flush_vec[1]){ // Xabcde
        let hand_swp =  hand[0]
        for(let i = 0; i< hand.length-1; i++){
            hand[i] = hand[i+1];
        }
        hand[hand.length-1] = hand_swp
        return FCP_Hand_Rank.SF;
     }

     if(is_straight_vec[2] && is_flush_vec[2]){ // AX5432
        let hand_A =  hand[0]
        let hand_X =  hand[1]
        for(let i = 0; i< hand.length-2; i++){
            hand[i] = hand[i+2];
        }
        hand[hand.length-2]  = hand_A
        hand[hand.length-1]  = hand_X
        return FCP_Hand_Rank.SF;
     }

      if(ranked_value_counter[0].length == 4){
        return FCP_Hand_Rank.FK
      }


      if(ranked_value_counter[0].length == 3 && ranked_value_counter[1].length > 1){
        return FCP_Hand_Rank.FH
      }

      let suit_counter = new Map<number, Card[] >();
      for(let h of hand){
        if(suit_counter.has(h.suit)){
          suit_counter.get(h.suit).push(h);
        }
        else {
          suit_counter.set(h.suit, [h] as Card[]);
        }
      }

      let ranked_suit_counter  = [...suit_counter].sort((a, b) =>{ //Descending
        return b[1].length - a[1].length;
       }).map(x=>x[1]);  // [Card[], Card[], Card[]]

      if(ranked_suit_counter[0].length == 5){
        let flush = ranked_suit_counter[0].sort((a,b) => b.value - a.value);
        hand.length = 0; //clear hand
        flush.forEach(card => hand.push(card))
        hand.push(ranked_suit_counter[1][0]);
        return FCP_Hand_Rank.F;
      }

      if (is_straight_vec[0]){
        return FCP_Hand_Rank.S;
      }

      if (is_straight_vec[1]){
        let hand_swp =  hand[0]
        for(let i = 0; i< hand.length-1; i++){
            hand[i] = hand[i+1];
        }
        hand[hand.length-1]  = hand_swp
        return FCP_Hand_Rank.S;
      }

      if (is_straight_vec[2]){
        let hand_A =  hand[0]
        let hand_X =  hand[1]
        for(let i = 0; i< hand.length-2; i++){
            hand[i] = hand[i+2];
        }
        hand[hand.length-2]  = hand_A
        hand[hand.length-1]  = hand_X
        return FCP_Hand_Rank.S;
      }

      if(ranked_value_counter[0].length == 3){
        return FCP_Hand_Rank.TK;
      }

      if(ranked_value_counter[0].length == 2 && ranked_value_counter[1].length == 2 ){
        return FCP_Hand_Rank.TP;
      }

      if(ranked_value_counter[0].length == 2){
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

  // let a = fcp.deal_hand();

  let a = [ new Card(0,12), new Card(0,11),new Card(0,3), new Card(0,2),new Card(0,1), new Card(0,0)]
  console.log("hand_rank of a")
  console.log(FCP_Hand_Rank_Name[FCPRank.hand_rank(a)]);
  console.log("a");
  for (let x of a){
    x.print();
  }

  // let b = fcp.deal_hand();
  // let b = [new Card(1,12), new Card(0,11),new Card(0,10), new Card(0,9),new Card(0,8), new Card(0,7)]
  // let b = [new Card(1,12), new Card(0,12),new Card(2,12), new Card(0,9),new Card(1,9), new Card(2,9)]
  let b = [ new Card(0,12), new Card(1,12),new Card(0,3), new Card(0,2),new Card(0,1), new Card(0,0)]
  console.log("hand_rank of b")
  console.log(FCP_Hand_Rank_Name[FCPRank.hand_rank(b)]);

  console.log("b");
  for (let x of b){
    x.print();
  }

  console.log("compare a b")
  console.log(FCPRank.compare(a,b));
}

// testFCPRank();


class FcpState {
  contact: Contact
  username: string
  ante: number
  change: number
  bonus:number
  change_card_ids: Array<number>
  hand: Array<Card>
  rank: FCP_Hand_Rank
  ever_change: boolean

  constructor(contact : Contact, username : string, ante: number,change: number = 0, bonus: number = 0, change_card_ids: Array<number> = [], hand : Array<Card> = [] as Card[], rank:FCP_Hand_Rank = FCP_Hand_Rank.H, ever_change: boolean = false){
    this.contact = contact;
    this.username = username;
    this.ante = ante;
    this.change = change;
    this.bonus = bonus;
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

  constructor(bot: Wechaty, no_shuffle: boolean = false, shuffling_threshold: number = 10, max_player: number = 4, change_rate: number = 1 ) {
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

1.游戏模式: 多人吃鸡模式, 只比最大五张
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
    // await sleep(3000)

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
      s.hand = this.poker.deal_hand();
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
        let number_length = Math.min(6, number_strings.length);
        let change_card_ids = new Set<number>();
        for(let i = 0; i< number_length; i++){
          let id = parseFloat(/\d/.exec(number_strings[i])?.[0]) || -1;
          if(id < 1 || id > 6 ){
            m.say(`${await getDispName(m.talker(), room)} 输入换牌序号格式有误，请检查是否为1-6`)
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


    resp += "\n总奖池大小为"+ pot + "\n\n";

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


    if(state.size !=2 ){
      for(let r of runnerup_keys){
        pot -= state.get(r).change;
      }
    }

    let div_pot = Math.floor((pot/champion_keys.size)*100)/100;

    resp += `恭喜 ${champion_names} 成功吃鸡！ 赢家收获 ${div_pot}B\n`;

    if(state.size !=2 && runnerup_keys.size){
      resp += `恭喜 ${runnerup_names} 成功喝汤！ 返还换牌钱\n`;
    }

    if(state.size > 1){
      let ever_pp = false;
      for (let [key, s] of state) {
        let odds = FCP_Bonus_Odds[s.rank];
        s.bonus = odds * (s.ante + s.change);
        if(s.bonus){
          let act = await this.getAccount(key);
          act.balance += s.bonus;
          if(!ever_pp){
            resp += "\n恭喜以下几个B中宝!\n\n"
            ever_pp = true;
          }
          resp += s.username + ": " +FCP_Hand_Rank_Name[s.rank] + " " + s.bonus+"B\n";
          resp += `=${odds} * 总下注 ${s.ante+s.change}\n`
        }
      }
      if(!ever_pp){
        resp += "\n无人中宝\n"
      }
    }


    resp += "\n全体收益细则:\n\n";

    for(let [key, s] of state){
      resp += s.username + ": ";
      let act = await this.getAccount(key);
      if(champion_keys.has(key)){
        act.balance += div_pot
        resp += "吃鸡 净收益: "+(div_pot - s.ante - s.change + s.bonus) + "B";
      }
      else if(state.size != 2 && runnerup_keys.has(key)){
        act.balance += s.change
        resp += "喝汤 净收益: "+(- s.ante + s.bonus) + "B";
      }
      else
      {
      resp += "菜 净收益: " + (- s.ante  - s.change + s.bonus) + "B";
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


