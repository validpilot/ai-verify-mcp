import { ReactNode, Suspense } from 'react'
import { Spin } from 'antd'

export const lazyLoader = (Component: React.LazyExoticComponent<() => JSX.Element>): ReactNode => {
  return (
    <Suspense
      fallback={<Spin size='large' style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }} />}
    >
      <Component />
    </Suspense>
  )
}
