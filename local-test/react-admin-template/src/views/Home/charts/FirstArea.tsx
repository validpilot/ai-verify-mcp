import { Area } from '@ant-design/charts'

const FirstArea = () => {
  const config = {
    data: {
      type: 'fetch',
      value: 'https://assets.antv.antgroup.com/g2/stocks.json',
      transform: [{ type: 'filter', callback: (d: { symbol: string }) => d.symbol === 'GOOG' }]
    },
    xField: (d: { date: string | number | Date }) => new Date(d.date),
    yField: 'price',
    style: {
      fill: 'linear-gradient(-90deg, white 0%, #2288ff 100%)'
    },
    axis: {
      y: false,
      x: false
    },
    line: {
      style: {
        stroke: '#2288ff',
        strokeWidth: 2
      }
    }
  }
  return <Area {...config} />
}

export default FirstArea
