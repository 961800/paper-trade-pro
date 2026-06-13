import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { authRouter } from "./auth";
import { marketRouter } from "./market";
import { ordersRouter } from "./orders";
import { positionsRouter } from "./positions";
import { tradesRouter } from "./trades";
import { watchlistRouter } from "./watchlist";
import { leaderboardRouter } from "./leaderboard";
import { notificationsRouter } from "./notifications";
import { dashboardRouter } from "./dashboard";
import { analyticsRouter } from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/market", marketRouter);
router.use("/orders", ordersRouter);
router.use("/positions", positionsRouter);
router.use("/trades", tradesRouter);
router.use("/watchlist", watchlistRouter);
router.use("/leaderboard", leaderboardRouter);
router.use("/notifications", notificationsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/analytics", analyticsRouter);

export default router;
