
class Card{
  suit : number
  value: number
  constructor(suit: number = 1, value: number = 2){
    this.suit = suit;
    this.value = value;
  }

  get_string(){
    return this.suit+"_"+this.value;
  }
  print(){
    console.log(this.get_string())
  }
}

class Poker<C extends Card>{
  CardType : new(a:number, b:number) => C
  cards : C[]
  suit_size: number
  value_size: number
  cards_num: number
  next : number
  debug_line_size: number

  constructor(cardtype: new (a:number, b:number) => C , suit_size: number, value_size: number, debug_line_size : number = 7){
    this.cards = [];
    this.suit_size = suit_size;
    this.value_size = value_size;
    this.cards_num = suit_size * value_size;
    this.next = 0;
    this.debug_line_size = debug_line_size;
    this.CardType = cardtype;
    for (let i: number = 0; i < suit_size; ++i){
      for (let j: number = 0; j < value_size; ++j){
        this.cards.push(new this.CardType(i, j));
      }
    }
    this.shuffle();
  }

  shuffle() {
    for(let i: number = 0; i < this.cards_num; ++i){
      let swap_idx = Math.floor(Math.random()*(this.cards_num -i)) + i;
      [this.cards[i], this.cards[swap_idx]] =
      [this.cards[swap_idx], this.cards[i]];
    }
  }

  print(){
    let print_i :number = 0;
    let print_line_str: string = "";
    let log_str :string =  "Suit size is " + this.suit_size + ". Value size is " + this.value_size+".";
    console.log(log_str);
    for (let card of this.cards){
      if(print_i < this.debug_line_size - 1){
         print_line_str += card.get_string() + " ";
        print_i += 1;
      }
      else {
         print_line_str += card.get_string();
        console.log(print_line_str);
        print_line_str = "";
        print_i = 0;
      }

    }

  }

  restart(){
    this.next = 0;
    this.shuffle();
  }

  deal(num: number  = 1, auto_restart = true){
    let ret = [];
    for(let i = 0; i < num; ++i){
      if(this.next == this.cards_num){
        if (auto_restart){
          this.restart();
        }
        else {
          return ret;
        }
      }
      ret.push(this.cards[this.next]);
      this.next +=1;
    }
    return ret;

    }
}


class Std52Card extends Card{
  static readonly Suit : string[] = ["♠", "♥", "♦", "♣"];
  static readonly Value : string[] = [ "2", "3", "4", "5", "6", "7", "8",
                                       "9", "10", "J", "Q", "K", "A"];
  get_string(){
    return Std52Card.Suit[this.suit]+Std52Card.Value[this.value];
  }
}

class Std52Poker extends Poker<Std52Card>{
  constructor(){
    super(Std52Card,4,13);
  }
}


export {
  Std52Card,
  Std52Poker
}
