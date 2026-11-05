import { LocalizedText } from "../../components/localized-text";

export default function Loading() {
  return <div className="container" aria-busy="true"><div className="loading-state"><span className="loading-bar" /><span className="loading-bar loading-bar-short" /><p><LocalizedText en="Loading workspace…" /></p></div></div>;
}
