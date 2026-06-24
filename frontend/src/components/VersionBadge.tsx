import { Link } from "react-router-dom";
import { APP_VERSION } from "../changelog";

/** Discreet version badge (bottom-right). Links to the changelog; build stamp in the tooltip. */
export function VersionBadge() {
  return (
    <Link
      to="/changelog"
      className="version-badge"
      title={`Build ${__BUILD_SHA__} · ${__BUILD_DATE__}`}
    >
      v{APP_VERSION}
    </Link>
  );
}
