import { Switch } from 'antd'
import { useEffect } from 'react'
import { useStore } from '@/store/index'
import { HappyProvider } from '@ant-design/happy-work-theme'
import { MoonOutlined, SunOutlined } from '@ant-design/icons'
import { SwitchChangeEventHandler } from 'antd/es/switch'

function ThemeSwitch() {
  const { isDark, updateTheme } = useStore()

  useEffect(() => {
    isDark === 'dark'
      ? document.documentElement.classList.add('dark')
      : document.documentElement.classList.remove('dark')
  }, [])
  const handleThemeChange: SwitchChangeEventHandler = (
    checked: boolean,
    $event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const x = $event.clientX
    const y = $event.clientY
    const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    const theme = checked ? 'dark' : 'light'

    const updateThemeAndTransition = () => {
      if (checked) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      localStorage.setItem('isDark', theme)
      updateTheme(theme)
    }

    if (!document.startViewTransition) {
      updateThemeAndTransition()
      return
    }

    const transition = document.startViewTransition(updateThemeAndTransition)

    transition.ready.then(() => {
      const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
      document.documentElement.animate(
        {
          clipPath: isDark === 'dark' ? [...clipPath].reverse() : clipPath
        },
        {
          duration: 500,
          easing: 'ease-in',
          pseudoElement: isDark === 'dark' ? '::view-transition-old(root)' : '::view-transition-new(root)'
        }
      )
    })
  }

  return (
    <>
      <HappyProvider>
        <Switch
          checkedChildren={<MoonOutlined style={{ fontSize: '14px' }} />}
          unCheckedChildren={<SunOutlined style={{ fontSize: '14px' }} />}
          checked={isDark === 'dark' ? true : false}
          onChange={handleThemeChange}
        />
      </HappyProvider>
    </>
  )
}

export default ThemeSwitch
