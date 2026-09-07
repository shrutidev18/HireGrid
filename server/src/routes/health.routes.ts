import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';

/**
 * Route files stay declarative: they map a method + path to a controller and
 * nothing else. No validation, no database access, no branching. Anything
 * resembling logic belongs in the controller, and anything resembling business
 * logic belongs in a service below that.
 */
const router = Router();

router.get('/', getHealth);

export default router;
