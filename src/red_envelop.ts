import { Wechaty, Message, Contact } from 'wechaty'
import {
  Account, CoinConfig, getDispName,
  sleep, filterAsync, shuffle
} from './account_utils'


class REState {
  contact: Contact
  username: string
  reward: number

  constructor(contact: Contact, username:string, reward:number = 0 ){
    this.contact = contact;
    this.username = username
    this.reward = reward;
  }
}


abstract class RedEnvelop{
  bot: Wechaty
  accounts: Record<string, Account>
  max_player_num: number
  keyword: string
  min_amount: number

  constructor(bot: Wechaty, keyword:string = "hongbao",  max_player_num: number = 20, min_amount :number = 1) {
    this.bot = bot
    this.max_player_num = max_player_num;
    this.keyword = keyword;
    this.min_amount =  min_amount;
  }

  async run(msg: Message, accounts: Record<string, Account>){
    this.accounts = accounts;
    const room = msg.room();
    let state = new Map<string, REState>();
    let amount = 0;
    let player_num = 0;
    let donor_name :string;
    if (msg.room()?.id === room.id && msg.text().includes(this.keyword)) {
      let number_strings= msg.text().replace(/[^\d.]/g," ").trim().split(/\s+/);
      if(number_strings.length != 2){
        await msg.say(`输入格式为: ${this.keyword} x y。x为总金额 y为总人数`)
        return;
      }
      amount = parseFloat(/\d+(\.\d+)?/.exec(number_strings[0])?.[0]) || 0;
      player_num = parseFloat(/\d+(\.\d+)?/.exec(number_strings[1])?.[0]) || 0;

      if(!amount || !player_num){
        await msg.say(`总金额与总人数都不能为空`)
        return;
      }

      if(player_num > this.max_player_num){
        await msg.say(`最多支持${this.max_player_num}人同时抢红包`);
        return;
      }
      donor_name = await getDispName(msg.talker(), room);
      if (amount < this.min_amount) {
        msg.say(`${donor_name} 无效，最少发${this.min_amount}`);
        return;
      }
      const act = await this.getAccount(msg.talker().id)
      if (act.balance < amount) {
        msg.say(`${donor_name} 余额为${act.balance}B, 不足${amount}B ，无法加入`);
        return;
      }


      act.balance -= amount;

      await msg.say(`${donor_name} 发了${amount}B红包 共${player_num}份。 \n输入「来」参与抢红包，手快有手慢无！ `)
    }

    const snatch = async (m: Message) => {
      let lai = "来"
      if (m.room()?.id === room.id && m.text().includes(lai)) {

        let username = await getDispName(m.talker(), room);
        if (state.size >= player_num){
          m.say(`${username} 无效，已达到最高人数${player_num}`);
          return;
        }
        const act = await this.getAccount(m.talker().id)
        if (state.has(m.talker().id)) {
          m.say(`${username} 无效，您已加入`)
          return
        }
        m.say(`${username} 成功加入`)
        state.set(m.talker().id, new REState(
          m.talker(),
          username
        ));
      }
    }

    this.bot.on('message', snatch)
    await sleep(20000)
    //await sleep(5000)
    this.bot.off('message', snatch)
    
    if(!state.size){
      const act = await this.getAccount(msg.talker().id)
      act.balance += amount;
      await msg.say(`无人抢红包，退还${amount}给${donor_name}, 当前余额为${act.balance}`);
      return;
    }

    this.share(state, amount, 2);

    let ret: Array<REState> = this.sort(state);
    let king = true;
    let resp = ""
    for (let s of ret) {
      if(king){
        resp += `【红包King】 ${s.username} : ${s.reward}\n\n`
        king = false;
      } else{
        resp += `${s.username} : ${s.reward}\n`
      }
    }
    resp += `\n以上用户诚挚感谢带善人 【${donor_name}】 发的${amount}B巨额红包!\n`
    await msg.say(resp);

  }

  abstract share(state: Map<string, REState>, amount: number, prec:number): void;

  sort(state: Map<string, REState>, descending:boolean = true) :Array<REState>  {
    let ret : REState[] = []
    for (let [key, s] of state) {
       ret.push(s);
    }
    if(descending){
       ret.sort((x, y) => y.reward - x.reward);
    }
    else {
       ret.sort((x, y) => x.reward - y.reward);
    }
    return ret;
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


class RandomRedEnvelop extends RedEnvelop {
  constructor(bot: Wechaty, keyword:string = "随机红包",  max_player_num: number = 20, min_amount :number = 40) {
    super(bot, keyword, max_player_num, min_amount);
  }

  share(state: Map<string, REState>, amount: number, prec:number = 2): void{
    let player_num = state.size;
  	let sumParts = 0;
		let prec_param = Math.pow(10,prec)
		amount *= prec_param;
		let i = 0;
    for (let [key, s] of state){
			if(i < player_num - 1){
				const pn = Math.ceil(Math.random() * (amount - sumParts))
				s.reward = pn/prec_param;
				sumParts += pn
				i++;
			}
			else {
			 	s.reward = (amount - sumParts)/prec_param;
		 	}
    }
  }
}

class EqualRedEnvelop extends RedEnvelop {
  constructor(bot: Wechaty, keyword:string = "平分红包",  max_player_num: number = 20, min_amount :number = 40) {
    super(bot, keyword, max_player_num, min_amount);
  }

  share(state: Map<string, REState>, amount: number, prec:number = 2): void{
    let player_num = state.size;
		let prec_param = Math.pow(10,prec)
  	let ave = Math.floor(amount * prec_param /player_num) / prec_param;
		let residual = amount - ave * player_num;

		let first = true;
    for (let [key, s] of state){
				if(first){
					s.reward = ave + residual;
					first = false;
				}
				else {
					s.reward = ave;
				}
    }
  }
}

export {
	RandomRedEnvelop,
	EqualRedEnvelop
}
