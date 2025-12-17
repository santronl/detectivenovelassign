// AI Functionality has been removed from this application.
// This file is kept as a placeholder to prevent import errors during transition
// but exports no functional logic.

import { AppState } from "../types";

export const analyzeMysteryText = async (
  text: string, 
  currentState: AppState
): Promise<Partial<AppState>> => {
    console.warn("AI analysis is disabled.");
    return {};
};