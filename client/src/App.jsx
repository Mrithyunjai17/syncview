import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';

// The room pulls in the LiveKit SDK; load it only when someone opens a room.
const Room = lazy(() => import('./pages/Room.jsx'));

export default function App() {
  return (
    <Suspense fallback={<main className="center-screen muted">Loading room…</main>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </Suspense>
  );
}
