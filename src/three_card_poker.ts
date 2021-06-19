import {Card, Poker, Std52Poker} from './std52poker'
import { Wechaty, Message, Contact } from 'wechaty'

enum Hand_Rank {H, P, F, S, T, SF}
const Hand_Rank_Name : string[] = ["High", "Pair", "Flush","Straight", "Three of a Kind", "Straight Flush"];

/*
Straight flush	Three suited cards in sequence	48	0.22%
Three of a kind	Three cards of same rank	52	0.24%
Straight	Three cards in sequence	720	3.26%
Flush	Three suited cards	1,096	4.96%
Pair	Two cards of same rank	3,744	16.94%
High card	None of the above	16,440	74.39%
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



class TCPGame(){




}





function test(){

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




//test();
