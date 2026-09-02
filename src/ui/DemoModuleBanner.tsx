import { Link } from "react-router-dom";
import { useStore } from "../store.tsx";

export function DemoModuleBanner() {
  const { tx } = useStore();
  return (
    <div className="demo-banner">
      <div>
        <strong>{tx("demoModuleTitle")}</strong>
        <p>{tx("demoModuleHint")}</p>
      </div>
      <Link to="/login" className="btn btn-primary btn-slim">
        {tx("loginSubmit")}
      </Link>
    </div>
  );
}
