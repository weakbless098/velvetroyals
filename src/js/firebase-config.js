const firebaseConfig = {
  apiKey: "AIzaSyB-AOH-ceKkUM-Ndr67_iW04eQ95BMMGi8",
  authDomain: "flowershop-d26f4.firebaseapp.com",
  projectId: "flowershop-d26f4",
  storageBucket: "flowershop-d26f4.firebasestorage.app",
  messagingSenderId: "378344608296",
  appId: "1:378344608296:web:2da47f9286905a04f2db1d",
  measurementId: "G-Z99LQX0HMJ",
  databaseURL: "https://flowershop-d26f4-default-rtdb.asia-southeast1.firebasedatabase.app"
};

try {
  firebase.initializeApp(firebaseConfig);
} catch (error) {
}

const db = firebase.database();
const auth = firebase.auth();

const flowersRef = db.ref('flowers');
const ordersRef = db.ref('orders');
const cartsRef = db.ref('carts');
