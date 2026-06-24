import { createContext, useContext } from "react";

export type CurrentUser = {
  user_id: number;
  username: string;
  full_name: string | null;
};

export const CurrentUserContext = createContext<CurrentUser | null>(null);

export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext);
}
