package main

import (
	"fmt"
	"log"

	"mahjong-backend/config"
	"mahjong-backend/handlers"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/spf13/cobra"
)

var (
	configPath string
	port       int
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "mahjong-backend",
		Short: "Mahjong tournament backend server",
		RunE:  run,
	}

	rootCmd.Flags().StringVarP(&configPath, "config", "c", "backend/db_config.json", "path to config file")
	rootCmd.Flags().IntVarP(&port, "port", "p", 8000, "server listen port")

	if err := rootCmd.Execute(); err != nil {
		log.Fatal(err)
	}
}

func run(cmd *cobra.Command, args []string) error {
	config.InitDB(configPath)

	mediaPath := config.ProjectRoot + "/media"

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Token"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	r.Static("/media", mediaPath)

	api := r.Group("/api/v1")
	{
		api.GET("/i18n/languages/", handlers.I18nLanguages)

		auth := api.Group("/auth")
		{
			auth.POST("/login/", handlers.Login)
			auth.POST("/logout/", handlers.Logout)
			auth.GET("/me/", handlers.Me)
		}

		players := api.Group("/players")
		{
			players.GET("/batch-avatars/", handlers.PlayerAvatarBatch)
			players.POST("/batch-avatars/", handlers.PlayerAvatarBatch)
			players.GET("", handlers.PlayerList)
			players.POST("", handlers.PlayerCreate)
			players.GET("/:pk/", handlers.PlayerDetail)
			players.PUT("/:pk/", handlers.PlayerUpdate)
			players.DELETE("/:pk/", handlers.PlayerDelete)
			players.GET("/:pk/games/", handlers.PlayerGames)
			players.GET("/:pk/stats/", handlers.PlayerStats)
			players.GET("/:pk/yakumans/", handlers.PlayerYakumans)
			players.GET("/:pk/majsoul-accounts/", handlers.PlayerMajsoulAccounts)
			players.POST("/:pk/majsoul-accounts/", handlers.PlayerAddMajsoulAccount)
			players.DELETE("/majsoul-accounts/:account_pk/", handlers.DeleteMajsoulAccount)
		}

		rooms := api.Group("/rooms")
		{
			rooms.GET("", handlers.RoomList)
			rooms.POST("", handlers.RoomCreate)
			rooms.GET("/:pk/", handlers.RoomDetail)
			rooms.PUT("/:pk/", handlers.RoomUpdate)
			rooms.DELETE("/:pk/", handlers.RoomDelete)
			rooms.POST("/:pk/close/", handlers.RoomClose)
			rooms.GET("/:pk/players/", handlers.RoomPlayerList)
			rooms.POST("/:pk/players/", handlers.RoomAddPlayer)
			rooms.DELETE("/:pk/players/:player_pk/", handlers.RoomRemovePlayer)
			rooms.GET("/:pk/games/", handlers.RoomGameList)
			rooms.POST("/:pk/games/", handlers.RoomCreateGame)
		}

		games := api.Group("/games")
		{
			games.GET("", handlers.GameList)
			games.POST("/online/", handlers.OnlineGameImport)
			games.GET("/online/parse/", handlers.OnlineGameParse)
			games.POST("/online/parse-batch/", handlers.OnlineGameParseBatch)
			games.POST("/online/retry/:pk/", handlers.OnlineGameRetry)
			games.POST("/online/bind-account/", handlers.BindMajsoulAccount)
			games.GET("/online/unbound-accounts/", handlers.UnboundMajsoulAccounts)
			games.GET("/pt-ranking/", handlers.PtRanking)
			games.GET("/fun-ranking/", handlers.FunRanking)
			games.GET("/paipu-stats/", handlers.PaipuStatsRanking)
			games.GET("/starting-hands/", handlers.StartingHands)
			games.GET("/starting-hands/player-averages/", handlers.StartingHandsPlayerAverages)
			games.GET("/yakumans/", handlers.YakumanList)
			games.GET("/yakumans/recent/", handlers.RecentYakuman)
			games.GET("/:pk/", handlers.GameDetail)
			games.PUT("/:pk/", handlers.GameUpdate)
			games.DELETE("/:pk/", handlers.GameDelete)
			games.PUT("/:pk/scores/", handlers.GameSubmitScores)
			games.PUT("/:pk/players/", handlers.GameUpdatePlayers)
			games.POST("/:pk/shuffle-seats/", handlers.GameShuffleSeats)
			games.GET("/:pk/hand-records/", handlers.HandRecordList)
			games.POST("/:pk/hand-records/", handlers.HandRecordCreate)
			games.DELETE("/:pk/hand-records/:record_pk/", handlers.HandRecordDelete)
		}

		ranking := api.Group("/ranking")
		{
			ranking.GET("/uma-configs/", handlers.UmaConfigList)
			ranking.POST("/uma-configs/", handlers.UmaConfigCreate)
			ranking.GET("/uma-configs/:pk/", handlers.UmaConfigDetail)
			ranking.PUT("/uma-configs/:pk/", handlers.UmaConfigUpdate)
			ranking.DELETE("/uma-configs/:pk/", handlers.UmaConfigDelete)
			ranking.GET("/tiers/", handlers.TierList)
			ranking.POST("/tiers/", handlers.TierCreate)
			ranking.GET("/tiers/:pk/", handlers.TierDetail)
			ranking.PUT("/tiers/:pk/", handlers.TierUpdate)
			ranking.DELETE("/tiers/:pk/", handlers.TierDelete)
			ranking.POST("/recalculate/", handlers.RankingRecalculate)
			ranking.GET("/leaderboard/", handlers.RankingLeaderboard)
			ranking.GET("/player/:pk/", handlers.PlayerRanking)
			ranking.GET("/player/:pk/game-results/", handlers.PlayerGameRankingResults)
			ranking.POST("/game/:pk/settle/", handlers.SettleGameRanking)
		}

		leagues := api.Group("/leagues")
		{
			leagues.GET("/media/:pk/", handlers.LeagueMedia)
			leagues.GET("/series/", handlers.LeagueSeriesList)
			leagues.POST("/series/", handlers.LeagueSeriesCreate)
			leagues.GET("/series/:pk/", handlers.LeagueSeriesDetail)
			leagues.PUT("/series/:pk/", handlers.LeagueSeriesUpdate)
			leagues.DELETE("/series/:pk/", handlers.LeagueSeriesDelete)
			leagues.POST("/series/:pk/logo/", handlers.LeagueSeriesUploadLogo)
			leagues.GET("/seasons/current/", handlers.LeagueCurrentSeasons)
			leagues.GET("/seasons/", handlers.LeagueAllSeasons)
			leagues.GET("/series/:pk/seasons/", handlers.LeagueSeasonList)
			leagues.POST("/series/:pk/seasons/new/", handlers.LeagueSeasonCreate)
			leagues.GET("/seasons/:pk/", handlers.LeagueSeasonDetail)
			leagues.PUT("/seasons/:pk/", handlers.LeagueSeasonUpdate)
			leagues.DELETE("/seasons/:pk/", handlers.LeagueSeasonDelete)
			leagues.POST("/seasons/:pk/start/", handlers.LeagueSeasonStart)
			leagues.POST("/seasons/:pk/finish/", handlers.LeagueSeasonFinish)
			leagues.POST("/seasons/:pk/reopen/", handlers.LeagueSeasonReopen)
			leagues.GET("/seasons/:pk/players/", handlers.LeagueSeasonPlayers)
			leagues.POST("/seasons/:pk/register/", handlers.LeagueRegisterPlayer)
			leagues.DELETE("/seasons/:pk/register/", handlers.LeagueUnregisterPlayer)
			leagues.POST("/seasons/:pk/batch-register/", handlers.LeagueBatchRegister)
			leagues.POST("/seasons/:pk/markdown-image/", handlers.LeagueUploadMarkdownImage)
			leagues.POST("/seasons/:pk/standard-stages/", handlers.LeagueCreateStandardStages)
			leagues.GET("/seasons/:pk/stages/", handlers.LeagueStageList)
			leagues.POST("/seasons/:pk/stages/new/", handlers.LeagueCreateStage)
			leagues.POST("/seasons/:pk/stages/standard/", handlers.LeagueCreateStandardStages)
			leagues.POST("/seasons/:pk/stages/reorder/", handlers.LeagueReorderStages)
			leagues.GET("/stages/:pk/", handlers.LeagueStageDetail)
			leagues.PUT("/stages/:pk/", handlers.LeagueStageUpdate)
			leagues.DELETE("/stages/:pk/", handlers.LeagueStageDelete)
			leagues.POST("/stages/:pk/start/", handlers.LeagueStageStart)
			leagues.POST("/stages/:pk/finish/", handlers.LeagueStageFinish)
			leagues.POST("/stages/:pk/recalculate/", handlers.LeagueRecalculatePT)
			leagues.POST("/stages/:pk/promote/", handlers.LeaguePromoteStage)
			leagues.GET("/stages/:pk/players/", handlers.LeagueStagePlayers)
			leagues.POST("/stages/:pk/players/sync/", handlers.LeagueSyncStagePlayers)
			leagues.POST("/stages/:pk/players/manage/", handlers.LeagueAddStagePlayers)
			leagues.PUT("/stages/:pk/players/manage/", handlers.LeagueUpdateStagePlayer)
			leagues.DELETE("/stages/:pk/players/manage/", handlers.LeagueRemoveStagePlayer)
			leagues.GET("/stages/:pk/ranking/", handlers.LeagueStageRanking)
			leagues.GET("/stages/:pk/matches/", handlers.LeagueMatchList)
			leagues.POST("/stages/:pk/matches/new/", handlers.LeagueCreateMatch)
			leagues.PUT("/stages/matches/:match_pk/", handlers.LeagueUpdateMatch)
			leagues.DELETE("/stages/matches/:match_pk/", handlers.LeagueDeleteMatch)
			leagues.POST("/stages/:pk/generate-semifinal/", handlers.LeagueGenerateSemifinal)
			leagues.POST("/stages/:pk/matches/offline/", handlers.LeagueCreateOfflineMatch)
			leagues.POST("/stages/:pk/matches/online/", handlers.LeagueCreateOnlineMatch)
		}
	}

	addr := fmt.Sprintf(":%d", port)
	log.Println("Server starting on", addr)
	if err := r.Run(addr); err != nil {
		return fmt.Errorf("server failed: %w", err)
	}
	return nil
}
