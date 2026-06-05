import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ServerErrorPage } from "@/components/errors/ServerErrorPage";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return <ServerErrorPage kind="not-found" />;
};

export default NotFound;
