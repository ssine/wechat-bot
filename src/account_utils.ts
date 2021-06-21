import { Room, Contact } from 'wechaty'
type Account = {
  balance: number
}

type CoinConfig = {
  storage: string
  adminId: string
}

const getDispName = async (contact: Contact, room?: Room) => {
  return (await room?.alias(contact)) || contact.name() || contact.id
}

const sleep = async (ms: number) => {
  return new Promise((res, rej) => {
    setTimeout(() => {
      res(null)
    }, ms);
  })
}

const filterAsync = (array: any[], filter: any) =>
  Promise.all(array.map(entry => filter(entry)))
  .then(bits => array.filter(entry => bits.shift()));

function shuffle(array: any[]) {
  var currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}

export {
	Account,
	CoinConfig,
	getDispName,
	sleep,
	filterAsync,
	shuffle
}
