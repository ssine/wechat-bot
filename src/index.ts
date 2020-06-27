import { getBotInstance } from './bot'
import ExercisePuncher from './exercise-puncher'
import config from './config'

(async () => {
  const bot = await getBotInstance()

  const puncherTest = new ExercisePuncher(bot, config.exercisePuncherTest)
  await puncherTest.init()

  const puncher = new ExercisePuncher(bot, config.exercisePuncher)
  await puncher.init()
})()
