import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import moduleARouter from "./module-a";
import moduleBRouter from "./module-b";
import moduleCRouter from "./module-c";
import alertsRouter from "./alerts";
import reportsRouter from "./reports";
import ingestRouter from "./ingest";
import liveRouter from "./live";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(moduleARouter);
router.use(moduleBRouter);
router.use(moduleCRouter);
router.use(alertsRouter);
router.use(reportsRouter);
router.use(ingestRouter);
router.use(liveRouter);
router.use(adminRouter);

export default router;
