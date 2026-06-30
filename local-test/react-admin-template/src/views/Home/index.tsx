import styles from './index.module.scss'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { Tooltip, Avatar, List } from 'antd'
import BigColumn from './charts/BigColumn'
import FirstLine from './charts/FirstLine'
import FirstArea from './charts/FirstArea'
import FirstTiny from './charts/FirstTiny'
import FirstScatter from './charts/FirstScatter'

function Home() {
  const data = [
    {
      title: 'Ant Design Title 1'
    },
    {
      title: 'Ant Design Title 2'
    },
    {
      title: 'Ant Design Title 3'
    },
    {
      title: 'Ant Design Title 4'
    },
    {
      title: 'Ant Design Title 5'
    },
    {
      title: 'Ant Design Title 6'
    }
  ]

  return (
    <>
      <div className={styles.container}>
        <div className={styles.left}>
          <div className={styles.left_bottom}>
            {/* 卡片 */}
            <div className={styles.cardContainer}>
              <div className={styles.cardItem} style={{ justifyContent: 'space-between' }}>
                <p style={{ fontSize: 18, margin: 0, display: 'flex', justifyContent: 'space-between' }}>
                  <span>访问量</span>
                  <Tooltip placement='top' title='指示器提示'>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </p>
                <div style={{ height: 125, textAlign: 'center' }}>
                  <FirstLine></FirstLine>
                </div>
              </div>
              <div className={styles.cardItem} style={{ justifyContent: 'space-between' }}>
                <p style={{ fontSize: 18, margin: 0, display: 'flex', justifyContent: 'space-between' }}>
                  <span>销售额</span>
                  <Tooltip placement='top' title='指示器提示'>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </p>
                <div style={{ height: 125, textAlign: 'center' }}>
                  <FirstArea></FirstArea>
                </div>
              </div>
              <div className={styles.cardItem} style={{ justifyContent: 'space-between' }}>
                <p style={{ fontSize: 18, margin: 0, display: 'flex', justifyContent: 'space-between' }}>
                  <span>进度</span>
                  <Tooltip placement='top' title='指示器提示'>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </p>
                <div style={{ height: 125, textAlign: 'center' }}>
                  <FirstTiny></FirstTiny>
                </div>
              </div>
              <div className={styles.cardItem} style={{ justifyContent: 'space-between' }}>
                <p style={{ fontSize: 18, margin: 0, display: 'flex', justifyContent: 'space-between' }}>
                  <span>散点图</span>
                  <Tooltip placement='top' title='指示器提示'>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </p>
                <div style={{ height: 125, textAlign: 'center' }}>
                  <FirstScatter></FirstScatter>
                </div>
              </div>
            </div>
            <div id='columnChart' className={styles.columnChart}>
              <BigColumn></BigColumn>
            </div>
          </div>
        </div>
        <div className={styles.right}>
          <List
            itemLayout='horizontal'
            dataSource={data}
            renderItem={(item, index) => (
              <List.Item>
                <List.Item.Meta
                  avatar={<Avatar src={`https://api.dicebear.com/7.x/miniavs/svg?seed=${index}`} />}
                  title={<a href='https://ant.design'>{item.title}</a>}
                  description='Ant Design, a design language for background applications, is refined by Ant UED Team'
                />
              </List.Item>
            )}
          />
        </div>
      </div>
    </>
  )
}

export default Home
