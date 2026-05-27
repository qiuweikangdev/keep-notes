import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GithubInfo } from "@/types";

interface UserState {
  githubInfo: GithubInfo;
  setGithubInfo: (info: Partial<GithubInfo>) => void;
  resetUser: () => void;
}

const defaultGithubInfo: GithubInfo = {
  username: "",
  email: "",
  localPath: "",
  repoUrl: "",
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      githubInfo: defaultGithubInfo,

      setGithubInfo: (info) =>
        set((state) => ({
          githubInfo: { ...state.githubInfo, ...info },
        })),
      resetUser: () => set({ githubInfo: defaultGithubInfo }),
    }),
    {
      name: "user-storage",
    },
  ),
);
