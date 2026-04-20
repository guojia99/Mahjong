import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import LoginPage from '@/pages/LoginPage';
import HomePage from '@/pages/HomePage';
import PlayersPage from '@/pages/PlayersPage';
import PlayerListPage from '@/pages/PlayerListPage';
import PlayerProfilePage from '@/pages/PlayerProfilePage';
import RoomsPage from '@/pages/RoomsPage';
import RoomDetailPage from '@/pages/RoomDetailPage';
import GameDetailPage from '@/pages/GameDetailPage';
import GameListPage from '@/pages/GameListPage';
import PtRankingPage from '@/pages/PtRankingPage';
import YakumanListPage from '@/pages/YakumanListPage';
import { isAdmin } from '@/api/auth';

function AdminRoute({ children }: { children: React.ReactNode }) {
  if (!isAdmin()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<HomePage />} />
          <Route path="players" element={<AdminRoute><PlayersPage /></AdminRoute>} />
          <Route path="player-list" element={<PlayerListPage />} />
          <Route path="player-list/:id" element={<PlayerProfilePage />} />
          <Route path="rooms" element={<RoomsPage />} />
          <Route path="rooms/:id" element={<RoomDetailPage />} />
          <Route path="rooms/:roomId/games/:gameId" element={<GameDetailPage />} />
          <Route path="games" element={<GameListPage />} />
          <Route path="pt-ranking" element={<PtRankingPage />} />
          <Route path="yakumans" element={<YakumanListPage />} />
          {/* <Route path="games/online" element={<OnlineGamePage />} /> */}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
