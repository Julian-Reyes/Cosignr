// Login / Sign Up modal. Demo only: accounts aren't live yet, so nothing entered is sent or saved.
// Opened by any element with data-modal="login|signup" (the header buttons).
import { useEffect, useRef, useState } from "react";
import { toast } from "../lib/shared.js";

const MODES = {
  signup: { title: "Create your account", text: "Follow artists and see who they cosign.", submit: "Sign Up",
            ask: "Already have an account?", link: "Log in", other: "login" },
  login:  { title: "Welcome back", text: "Log in to see your cosigns and follows.", submit: "Log In",
            ask: "New to Cosignr?", link: "Create an account", other: "signup" },
};

export default function AuthModal() {
  const [mode, setMode] = useState("signup");
  const [open, setOpen] = useState(false);
  const email = useRef(null);

  useEffect(() => {
    const onClick = e => {
      const b = e.target.closest("[data-modal]");
      if (!b) return;
      setMode(b.dataset.modal);
      setOpen(true);
      setTimeout(() => email.current?.focus(), 50);
    };
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, []);

  const m = MODES[mode];
  const submit = e => {
    e.preventDefault();
    setOpen(false);
    toast(mode === "signup" ? "Welcome to Cosignr! (demo)" : "Logged in (demo)");
  };

  return (
    <div className={`modal${open ? " open" : ""}`} id="modal" aria-hidden={!open} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <form className="modal-card" id="authForm" role="dialog" aria-modal="true" aria-labelledby="modalTitle" onSubmit={submit}>
        <button className="close" type="button" aria-label="Close" onClick={() => setOpen(false)}>&times;</button>
        <h4 id="modalTitle">{m.title}</h4>
        <p id="modalText">{m.text}</p>
        <p className="demo-note">Demo: accounts aren't live yet, so nothing you enter here is sent or saved.</p>
        <label htmlFor="email">Email</label>
        <input id="email" ref={email} type="email" placeholder="you@example.com" required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" placeholder="••••••••" required />
        <button className="primary" id="modalSubmit" type="submit">{m.submit}</button>
        <p className="switch" id="modalSwitch">{m.ask} <a onClick={() => setMode(m.other)}>{m.link}</a></p>
      </form>
    </div>
  );
}
