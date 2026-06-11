import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import { isAdmin } from '@/api/auth';

function PageFallback() {
  return (
    <div
      className="min-h-[40vh] flex items-center justify-center text-sm"
      style={{ color: 'var(--color-text-light, #6b7280)' }}
      aria-busy="true"
    >
      …
    </div>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const HomePage = lazy(() => import('@/pages/HomePage'));
const PlayersPage = lazy(() => import('@/pages/PlayersPage'));
const PlayerListPage = lazy(() => import('@/pages/PlayerListPage'));
const PlayerProfilePage = lazy(() => import('@/pages/PlayerProfilePage'));
const RoomsPage = lazy(() => import('@/pages/RoomsPage'));
const RoomDetailPage = lazy(() => import('@/pages/RoomDetailPage'));
const GameDetailPage = lazy(() => import('@/pages/GameDetailPage'));
const GameListPage = lazy(() => import('@/pages/GameListPage'));
const PtRankingPage = lazy(() => import('@/pages/PtRankingPage'));
const FunRankingPage = lazy(() => import('@/pages/FunRankingPage'));
const OnlinePaipuStatsPage = lazy(() => import('@/pages/OnlinePaipuStatsPage'));
const StartingHandsPage = lazy(() => import('@/pages/StartingHandsPage'));
const YakumanListPage = lazy(() => import('@/pages/YakumanListPage'));
const DiscardAdvisePage = lazy(() => import('@/pages/DiscardAdvisePage'));
const CalculatorPage = lazy(() => import('@/pages/CalculatorPage'));
const PracticePage = lazy(() => import('@/pages/PracticePage'));
const OnlineGamePage = lazy(() => import('@/pages/OnlineGamePage'));
const RankingLeaderboardPage = lazy(() => import('@/pages/RankingLeaderboardPage'));
const RankingAdminPage = lazy(() => import('@/pages/RankingAdminPage'));
const RulesPage = lazy(() => import('@/pages/RulesPage'));
const ChangelogPage = lazy(() => import('@/pages/ChangelogPage'));
const LeaguesPage = lazy(() => import('@/pages/LeaguesPage'));
const LeagueSeasonDetailPage = lazy(() => import('@/pages/LeagueSeasonDetailPage'));
const LeagueStageDetailPage = lazy(() => import('@/pages/LeagueStageDetailPage'));
const LeagueAdminPage = lazy(() => import('@/pages/LeagueAdminPage'));
const LeagueSeriesAdminPage = lazy(() => import('@/pages/LeagueSeriesAdminPage'));
const LeagueSeasonAdminPage = lazy(() => import('@/pages/LeagueSeasonAdminPage'));
const LeagueSeasonPlayersAdminPage = lazy(() => import('@/pages/LeagueSeasonPlayersAdminPage'));
const LeagueSeasonStagesAdminPage = lazy(() => import('@/pages/LeagueSeasonStagesAdminPage'));
const LeagueStageAdminPage = lazy(() => import('@/pages/LeagueStageAdminPage'));

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
        <Route
          path="/login"
          element={
            <LazyPage>
              <LoginPage />
            </LazyPage>
          }
        />
        <Route
          path="/reset-password"
          element={
            <LazyPage>
              <ResetPasswordPage />
            </LazyPage>
          }
        />
        <Route path="/" element={<MainLayout />}>
          <Route
            index
            element={
              <LazyPage>
                <HomePage />
              </LazyPage>
            }
          />
          <Route
            path="players"
            element={
              <LazyPage>
                <AdminRoute>
                  <PlayersPage />
                </AdminRoute>
              </LazyPage>
            }
          />
          <Route
            path="player-list"
            element={
              <LazyPage>
                <PlayerListPage />
              </LazyPage>
            }
          />
          <Route
            path="player-list/:id"
            element={
              <LazyPage>
                <PlayerProfilePage />
              </LazyPage>
            }
          />
          <Route
            path="rooms"
            element={
              <LazyPage>
                <RoomsPage />
              </LazyPage>
            }
          />
          <Route
            path="rooms/online"
            element={
              <LazyPage>
                <AdminRoute>
                  <OnlineGamePage />
                </AdminRoute>
              </LazyPage>
            }
          />
          <Route
            path="rooms/:id"
            element={
              <LazyPage>
                <RoomDetailPage />
              </LazyPage>
            }
          />
          <Route
            path="rooms/:roomId/games/:gameId"
            element={
              <LazyPage>
                <GameDetailPage />
              </LazyPage>
            }
          />
          <Route
            path="games/:gameId"
            element={
              <LazyPage>
                <GameDetailPage />
              </LazyPage>
            }
          />
          <Route
            path="games"
            element={
              <LazyPage>
                <GameListPage />
              </LazyPage>
            }
          />
          <Route
            path="pt-ranking"
            element={
              <LazyPage>
                <PtRankingPage />
              </LazyPage>
            }
          />
          <Route
            path="fun-ranking"
            element={
              <LazyPage>
                <FunRankingPage />
              </LazyPage>
            }
          />
          <Route
            path="paipu-stats"
            element={
              <LazyPage>
                <OnlinePaipuStatsPage />
              </LazyPage>
            }
          />
          <Route
            path="starting-hands"
            element={
              <LazyPage>
                <StartingHandsPage />
              </LazyPage>
            }
          />
          <Route
            path="ranking"
            element={
              <LazyPage>
                <RankingLeaderboardPage />
              </LazyPage>
            }
          />
          <Route
            path="ranking-admin"
            element={
              <LazyPage>
                <AdminRoute>
                  <RankingAdminPage />
                </AdminRoute>
              </LazyPage>
            }
          />
          <Route
            path="yakumans"
            element={
              <LazyPage>
                <YakumanListPage />
              </LazyPage>
            }
          />
          <Route
            path="calculator"
            element={
              <LazyPage>
                <CalculatorPage />
              </LazyPage>
            }
          />
          <Route
            path="discard-advise"
            element={
              <LazyPage>
                <DiscardAdvisePage />
              </LazyPage>
            }
          />
          <Route
            path="practice"
            element={
              <LazyPage>
                <PracticePage />
              </LazyPage>
            }
          />
          <Route
            path="rules"
            element={
              <LazyPage>
                <RulesPage />
              </LazyPage>
            }
          />
          <Route
            path="changelog"
            element={
              <LazyPage>
                <ChangelogPage />
              </LazyPage>
            }
          />
          <Route
            path="leagues"
            element={
              <LazyPage>
                <LeaguesPage />
              </LazyPage>
            }
          />
          <Route
            path="leagues/:seasonId"
            element={
              <LazyPage>
                <LeagueSeasonDetailPage />
              </LazyPage>
            }
          />
          <Route
            path="leagues/stage/:stageId"
            element={
              <LazyPage>
                <LeagueStageDetailPage />
              </LazyPage>
            }
          />
          <Route
            path="league-admin"
            element={
              <LazyPage>
                <AdminRoute>
                  <LeagueAdminPage />
                </AdminRoute>
              </LazyPage>
            }
          />
          <Route
            path="league-admin/series/:seriesId"
            element={
              <LazyPage>
                <AdminRoute>
                  <LeagueSeriesAdminPage />
                </AdminRoute>
              </LazyPage>
            }
          />
          <Route
            path="league-admin/seasons/:seasonId"
            element={
              <LazyPage>
                <AdminRoute>
                  <LeagueSeasonAdminPage />
                </AdminRoute>
              </LazyPage>
            }
          />
          <Route
            path="league-admin/seasons/:seasonId/players"
            element={
              <LazyPage>
                <AdminRoute>
                  <LeagueSeasonPlayersAdminPage />
                </AdminRoute>
              </LazyPage>
            }
          />
          <Route
            path="league-admin/seasons/:seasonId/stages"
            element={
              <LazyPage>
                <AdminRoute>
                  <LeagueSeasonStagesAdminPage />
                </AdminRoute>
              </LazyPage>
            }
          />
          <Route
            path="league-admin/stages/:stageId"
            element={
              <LazyPage>
                <AdminRoute>
                  <LeagueStageAdminPage />
                </AdminRoute>
              </LazyPage>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
