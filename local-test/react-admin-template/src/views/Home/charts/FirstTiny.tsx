import { Tiny } from '@ant-design/charts'

interface Config {
  percent: number
  width: number
  height: number
  color: string[]
  annotations: {
    type: string
    style: {
      text: string
      x: string
      y: string
      textAlign: string
      fontSize: number
      fontStyle: string
      fill: string
    }
  }[]
}

const FirstTiny = () => {
  const percent: number = 0.7
  const config = {
    percent,
    width: 120,
    height: 120,
    color: ['#E8EFF5', '#1a80f7'],
    annotations: [
      {
        type: 'text',
        style: {
          text: `${percent * 100}%`,
          x: '50%',
          y: '50%',
          textAlign: 'center',
          fontSize: 16,
          fontStyle: 'bold',
          fill: '#1a80f7'
        }
      }
    ]
  } as Config

  return (
    <>
      <Tiny.Ring {...config} />
    </>
  )
}
export default FirstTiny
