// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCkQrdSODKaQch_HM5JlBaRth_Gpj43Fw0",
  authDomain: "clone-deb37.firebaseapp.com",
  databaseURL: "https://clone-deb37-default-rtdb.firebaseio.com",
  projectId: "clone-deb37",
  storageBucket: "clone-deb37.firebasestorage.app",
  messagingSenderId: "830085518857",
  appId: "1:830085518857:web:8dc3834d50979044b6cad8",
  measurementId: "G-SM29F836ZY"
};

// Initialize Firebase
// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get instances of Firebase services
const auth = getAuth(app);
const firestore = getFirestore(app);

export { auth, firestore };