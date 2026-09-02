import {
  auth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, fbSignOut
} from './firebase-init.js';

function setMsg(m) { document.getElementById('auth-msg').textContent = m; }

export function initAuth({ onSignedIn, onSignedOut }) {
  document.getElementById('auth-signin-btn').onclick = async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    if (!email || !pass) return setMsg('Enter email and password');
    try { await signInWithEmailAndPassword(auth, email, pass); }
    catch (e) { setMsg(e.message); }
  };

  document.getElementById('auth-signup-btn').onclick = async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    if (!email || !pass) return setMsg('Enter email and password');
    if (pass.length < 6) return setMsg('Password must be 6+ characters');
    try { await createUserWithEmailAndPassword(auth, email, pass); }
    catch (e) { setMsg(e.message); }
  };

  document.getElementById('signout-btn').onclick = () => fbSignOut(auth);

  onAuthStateChanged(auth, user => {
    if (user) onSignedIn(user);
    else onSignedOut();
  });
}
