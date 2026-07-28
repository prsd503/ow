import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBEYKHQpy_VjmgjYIwQOPjXth1bghYsf9M",
  authDomain: "finder-owl.firebaseapp.com", // Corrected format
  projectId: "finder-owl",
  storageBucket: "finder-owl.firebasestorage.app",
  messagingSenderId: "1011347100861",
  appId: "1:1011347100861:web:24246f9a4eb24d812cd3d4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Use onAuthStateChanged to ensure the user object is ready before attaching the click event
onAuthStateChanged(auth, (user) => {
    const btn = document.getElementById('submitDeleteBtn');
    if (btn) {
        btn.addEventListener('click', () => {
            if (!user) {
                alert("Session expired. Please log in again.");
                window.location.href = "index.html";
                return;
            }

            const email = user.email;
            const message = encodeURIComponent(`Hi, I am requesting to delete my Owl Watcher account. 
Please process my data export and account closure for the following email: ${email}`);

            window.location.href = `https://wa.me/919033406816?text=${message}`;
        });
    }
});
