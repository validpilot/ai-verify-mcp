import { create } from 'zustand'

export const useStore = create<{ isDark: String; updateTheme: (isDark: string) => void }>(set => ({
  isDark: localStorage.getItem('isDark') || 'light',
  updateTheme: (isDark: string) => {
    set({ isDark })
  }
}))
