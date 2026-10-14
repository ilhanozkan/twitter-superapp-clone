import { useStore } from "react-redux";

import { AppStore } from "../../store";

/** The store itself, to read the state as it is when an await resumes. */
export const useAppStore = useStore.withTypes<AppStore>();
