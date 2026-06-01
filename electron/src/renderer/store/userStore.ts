import { create } from 'zustand'

interface UserState {
  username: string | null
  isLoggedIn: boolean
  isAdmin: boolean

  setUser: (username: string, isAdmin?: boolean) => void
  logout: () => void
}

export const useUserStore = create<UserState>((set) => ({
  username: null,
  isLoggedIn: false,
  isAdmin: false,

  setUser: (username, isAdmin = false) =>
    set({ username, isLoggedIn: true, isAdmin }),

  logout: () =>
    set({ username: null, isLoggedIn: false, isAdmin: false })
}))
