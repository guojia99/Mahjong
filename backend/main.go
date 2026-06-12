package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	"mahjong-backend/auth"
	"mahjong-backend/config"
	"mahjong-backend/handlers"
	"mahjong-backend/majsoulpaipu"
	"mahjong-backend/middleware"
	"mahjong-backend/models"

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

	rootCmd.AddCommand(newSetPasswordCmd())
	rootCmd.AddCommand(newPaipuCmd())
	rootCmd.AddCommand(newPaipuLoginTestCmd())
	rootCmd.AddCommand(newPaipuAuthHelpCmd())
	rootCmd.AddCommand(newPaipuAiAnalyzeCmd())

	if err := rootCmd.Execute(); err != nil {
		log.Fatal(err)
	}
}

func newSetPasswordCmd() *cobra.Command {
	var username, password string
	cmd := &cobra.Command{
		Use:   "set-password",
		Short: "Reset a user password (Go md5$ format)",
		RunE: func(cmd *cobra.Command, args []string) error {
			if username == "" || password == "" {
				return fmt.Errorf("--username and --password are required")
			}
			config.InitDB(configPath)
			var user models.User
			if err := config.DB.Where("username = ?", username).First(&user).Error; err != nil {
				return fmt.Errorf("user not found: %w", err)
			}
			hashed := auth.HashPassword(password)
			if err := config.DB.Model(&user).UpdateColumn("password", hashed).Error; err != nil {
				return fmt.Errorf("update password: %w", err)
			}
			fmt.Fprintf(os.Stdout, "Password updated for user %q (id=%d)\n", user.Username, user.ID)
			return nil
		},
	}
	cmd.Flags().StringVarP(&configPath, "config", "c", "backend/db_config.json", "path to config file")
	cmd.Flags().StringVar(&username, "username", "", "username to reset")
	cmd.Flags().StringVar(&password, "password", "", "new plaintext password")
	_ = cmd.MarkFlagRequired("username")
	_ = cmd.MarkFlagRequired("password")
	return cmd
}

func newPaipuLoginTestCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "paipu-login-test",
		Short: "Test Majsoul account/password or access_token login",
		RunE: func(cmd *cobra.Command, args []string) error {
			config.Load(configPath)
			client, err := majsoulpaipu.NewClientFromConfig(config.ConfigFilePath, majsoulpaipu.AuthConfig{
				Account:         config.Cfg.MajsoulAccount,
				Password:        config.Cfg.MajsoulPassword,
				AccessToken:     config.Cfg.MajsoulAccessToken,
				OAuth2Type:      config.Cfg.MajsoulOAuth2Type,
				LoginRequestB64: config.Cfg.MajsoulLoginRequestB64,
			})
			if err != nil {
				return err
			}
			_, err = client.FetchRecords([]string{"260525-1c465ba0-a7da-4140-bacc-b8ee29f2b76b"}, true)
			if err != nil {
				return err
			}
			fmt.Fprintln(os.Stdout, "登录成功，牌谱拉取测试通过。")
			return nil
		},
	}
	cmd.Flags().StringVarP(&configPath, "config", "c", "backend/db_config.json", "path to config file")
	return cmd
}

func newPaipuAuthHelpCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "paipu-auth-help",
		Short: "Print how to configure Majsoul login for paipu fetch",
		RunE: func(cmd *cobra.Command, args []string) error {
			_, err := fmt.Fprint(os.Stdout, `雀魂牌谱拉取需要「国服网页账号」登录，任选其一：

【方式 A】账号密码（推荐，已适配国服 WebGL 网页版）
  编辑 backend/db_config.json：
    "majsoul_account": "与网页登录完全相同的账号（邮箱或手机号）",
    "majsoul_password": "网页登录密码"
    （清空 majsoul_access_token）
  测试：mahjong-backend paipu-login-test -c backend/db_config.json

  若报 code=151 且 version_str 为空：多为 WebGL 版本不匹配，可设
    MAJSOUL_WEBGL_RESOURCE=0.16.226  MAJSOUL_WEBGL_PACKAGE=4.0.38
  解析抓包：node backend/majsoul_node/paipu.js --parse-login '<req_b64>' '<res_b64>'
  注意：不是本网站管理员账号。

【方式 B】access_token（国服没有 GameMgr.Inst.access_token 时用）
  1. 浏览器打开 https://game.maj-soul.com 并登录进大厅
  2. F12 → Console，粘贴运行仓库文件全文：
     backend/majsoul_node/browser-find-token.js
  3. 复制输出的 token 到 db_config.json：
     "majsoul_access_token": "粘贴token",
     "majsoul_oauth2_type": 1

【方式 C】复用浏览器 login 上行帧（国服密码 151 / 1002 时最稳）
  1. F12 → Network → WS → route-*.maj-soul.com → Messages
  2. 在网页用账号密码登录成功后，找绿色上行帧（含你的邮箱 / .lq.Lobby.login）
  3. 右键 Copy message → Copy as Base64（或 node decode-ws-frame.js 确认是 login 请求）
  4. 写入 db_config.json：
     "majsoul_login_request_b64": "AgwA...",
     并清空 majsoul_access_token
  注意：帧内密码哈希有时效，过期需重新复制；会顶掉浏览器同账号会话。

【code=1002】
  多为浏览器仍在线或旧 majsoul_access_token。请关闭雀魂网页、清空 access_token 后重试。

`)
			return err
		},
	}
	return cmd
}

func newPaipuCmd() *cobra.Command {
	var analyze bool
	cmd := &cobra.Command{
		Use:   "paipu [url-or-uuid]",
		Short: "Fetch Majsoul paipu JSON via paipu.js (--detail)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			config.Load(configPath)
			client, err := majsoulpaipu.NewClientFromConfig(config.ConfigFilePath, majsoulpaipu.AuthConfig{
				Account:         config.Cfg.MajsoulAccount,
				Password:        config.Cfg.MajsoulPassword,
				AccessToken:     config.Cfg.MajsoulAccessToken,
				OAuth2Type:      config.Cfg.MajsoulOAuth2Type,
				LoginRequestB64: config.Cfg.MajsoulLoginRequestB64,
			})
			if err != nil {
				return err
			}
			input := args[0]
			var out interface{}
			if analyze {
				result, err := majsoulpaipu.AnalyzeURL(client, input)
				if err != nil {
					return err
				}
				out = map[string]interface{}{
					"uuid":          result.UUID,
					"start_time":    result.StartTime,
					"end_time":      result.EndTime,
					"game_mode":     result.GameMode,
					"player_count":  result.PlayerCount,
					"players":       result.Players,
					"raw_data":      result.RawData,
				}
			} else {
				out, err = majsoulpaipu.DetailJSON(client, input)
				if err != nil {
					return err
				}
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(out)
		},
	}
	cmd.Flags().StringVarP(&configPath, "config", "c", "backend/db_config.json", "path to config file")
	cmd.Flags().BoolVar(&analyze, "analyze", false, "also output normalized API fields (players/scores/game_mode)")
	return cmd
}

func newPaipuAiAnalyzeCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "paipu-ai-analyze <game-id>",
		Short: "Run Mortal AI analysis on one online game (requires mortal server)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			config.InitDB(configPath)
			if err := handlers.RunAiAnalysisForGameID(args[0]); err != nil {
				return err
			}
			fmt.Fprintln(os.Stdout, "AI analysis completed.")
			return nil
		},
	}
	cmd.Flags().StringVarP(&configPath, "config", "c", "backend/db_config.json", "path to config file")
	return cmd
}

func run(cmd *cobra.Command, args []string) error {
	config.InitDB(configPath)
	handlers.StartAiAnalysisWorker()

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
	api.Use(middleware.OptionalAuth())
	api.Use(middleware.QueryCache())
	{
		api.GET("/i18n/languages/", handlers.I18nLanguages)

		auth := api.Group("/auth")
		{
			auth.POST("/login/", handlers.Login)
			auth.POST("/logout/", handlers.Logout)
			auth.GET("/me/", handlers.Me)
			auth.POST("/verification/send/", handlers.VerificationSend)
			auth.POST("/reset-password/confirm/", handlers.ResetPasswordConfirm)
			auth.POST("/bind-email/confirm/", handlers.BindEmailConfirm)
			auth.POST("/change-email/confirm/", handlers.ChangeEmailConfirm)
			auth.POST("/change-password/", handlers.ChangePassword)
		}

		admin := api.Group("/admin", middleware.AdminRequired())
		{
			admin.GET("/login-logs/", handlers.LoginLogList)
			admin.GET("/users/unbound/", handlers.UnboundUserList)
		}

		players := api.Group("/players", middleware.InvalidateQueryCacheAfterGameWrite())
		{
			players.GET("/batch-avatars/", handlers.PlayerAvatarBatch)
			players.POST("/batch-avatars/", handlers.PlayerAvatarBatch)
			players.GET("", handlers.PlayerList)
			players.POST("", handlers.PlayerCreate)
			players.GET("/:pk/", handlers.PlayerDetail)
			players.GET("/:pk/avatar/", handlers.PlayerAvatar)
			players.PUT("/:pk/", handlers.PlayerUpdate)
			players.DELETE("/:pk/", handlers.PlayerDelete)
			players.GET("/:pk/games/", handlers.PlayerGames)
			players.GET("/:pk/stats/", handlers.PlayerStats)
			players.GET("/:pk/ai-match-scores/", handlers.PlayerAiMatchScoreSeries)
			players.GET("/:pk/yakumans/", handlers.PlayerYakumans)
			players.GET("/:pk/majsoul-accounts/", handlers.PlayerMajsoulAccounts)
			players.POST("/:pk/majsoul-accounts/", handlers.PlayerAddMajsoulAccount)
			players.DELETE("/majsoul-accounts/:account_pk/", handlers.DeleteMajsoulAccount)
			players.POST("/:pk/enable-account/", handlers.PlayerEnableAccount)
			players.POST("/:pk/bind-account/", handlers.PlayerBindAccount)
			players.PUT("/:pk/account/", handlers.PlayerUpdateAccount)
			players.POST("/:pk/reset-system-password/", handlers.PlayerResetSystemPassword)
			players.POST("/:pk/set-password/", handlers.PlayerSetPassword)
		}

		rooms := api.Group("/rooms", middleware.InvalidateQueryCacheAfterGameWrite())
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

		games := api.Group("/games", middleware.InvalidateQueryCacheAfterGameWrite())
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
			games.GET("/ai-paipu-stats/", handlers.AiPaipuStatsRanking)
			games.GET("/ai-grade-tiers/", handlers.AiGradeTiers)
			games.GET("/ai-mortal-backends/", handlers.AiMortalBackends)
			games.GET("/:pk/ai-analysis/", handlers.GameAiAnalysisDetail)
			games.POST("/:pk/ai-analysis/trigger/", handlers.GameAiAnalysisTrigger)
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

		tools := api.Group("/tools")
		{
			tools.POST("/discard-advise/", handlers.DiscardAdvise)
		}
	}

	addr := fmt.Sprintf(":%d", port)
	log.Println("Server starting on", addr)
	if err := r.Run(addr); err != nil {
		return fmt.Errorf("server failed: %w", err)
	}
	return nil
}
