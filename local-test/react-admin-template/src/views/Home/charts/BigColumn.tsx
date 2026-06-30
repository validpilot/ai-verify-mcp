import { data } from '../data'
import React from 'react'
import { Column } from '@ant-design/charts'
import { useStore } from '@/store'
const BigColumn: React.FC = () => {
  const { isDark } = useStore()

  const config = {
    data,
    xField: '月份',
    yField: '月均降雨量',
    stack: true,
    colorField: 'name',
    axis: {
      x: {
        labelFontSize: 14,
        labelAlign: 'horizontal',
        labelFill: isDark === 'dark' ? '#fff' : '#141414',
        tickStroke: isDark === 'dark' ? '#fff' : '#141414'
      },
      y: {
        labelFontSize: 16,
        labelFill: isDark === 'dark' ? '#fff' : '#141414',
        tickStroke: isDark === 'dark' ? '#fff' : '#141414'
      }
    }
  }
  return <Column {...config} />
}

export default BigColumn
