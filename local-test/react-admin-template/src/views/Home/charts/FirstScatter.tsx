import { Scatter } from '@ant-design/charts'

const FirstScatter = () => {
  const config = {
    data: {
      type: 'fetch',
      value: 'https://gw.alipayobjects.com/os/basement_prod/6b4aa721-b039-49b9-99d8-540b3f87d339.json'
    },
    xField: 'height',
    yField: 'weight',
    axis: {
      x: false,
      y: false
    },
    colorField: 'gender'
  }
  return <Scatter {...config} />
}

export default FirstScatter
