import React from "react";
import { Receipt } from "lucide-react";

export function Button({children, variant="primary", className="", ...props}) {
  return <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button>;
}

export function Input({label, ...props}) {
  return <label className="field"><span>{label}</span><input {...props}/></label>;
}

export function PageTitle({title,subtitle,action}) {
  return <div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

export function Empty({text}) {
  return <div className="empty"><Receipt size={24}/><span>{text}</span></div>;
}
