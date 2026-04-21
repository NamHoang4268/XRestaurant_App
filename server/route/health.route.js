import express from 'express';
import { getSequelize } from '../config/database.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { detailedHealthCheck } = require('../middleware/healthMonitor.js');

const router = express.Router();

/**
 * Health check endpoint
 * GET /health
 * Returns database connection status and application health
 */
router.get('/', async (req, res) => {
    try {
        const sequelize = getSequelize();
        
        // Test database connectivity with a simple query
        const startTime = Date.now();
        await sequelize.query('SELECT 1');
        const queryTime = Date.now() - startTime;
        
        // Get connection pool status
        const pool = sequelize.connectionManager.pool;
        const poolStatus = {
            size: pool.size,
            available: pool.available,
            using: pool.using,
            waiting: pool.waiting
        };
        
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                responseTime: `${queryTime}ms`,
                pool: poolStatus
            },
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                unit: 'MB'
            }
        });
        
    } catch (error) {
        console.error('Health check failed:', error);
        
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: {
                connected: false,
                error: error.message
            },
            uptime: process.uptime()
        });
    }
});

/**
 * Detailed health check endpoint
 * GET /health/detailed
 * Returns comprehensive health check with multiple tests
 */
router.get('/detailed', (req, res) => {
    // Store sequelize in req.app for middleware access
    try {
        const sequelize = getSequelize();
        req.app.set('sequelize', sequelize);
    } catch (error) {
        return res.status(503).json({
            status: 'unhealthy',
            error: 'Database not initialized',
        });
    }
    
    return detailedHealthCheck(req, res);
});

export default router;
