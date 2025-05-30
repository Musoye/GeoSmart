import { Router, Request, Response } from "express";
import { verifyToken } from "../utils/jwt";
import { getDistance } from "geolib";

const router = Router();

// Test endpoint
router.get("/test", async (req: Request, res: Response) => {
  return res.status(200).json({ 
    message: 'Location routes working successfully..so get your location',
    timestamp: new Date().toISOString()
  });
});

// Get user's current target location (optional additional endpoint)
router.get("/target", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const pool = req.app.get("pool");
    if (!pool) {
      return res.status(500).json({ error: "Database connection not available" });
    }

    const decoded = verifyToken(token);
    const userId = decoded.id;

    const result = await pool.query(
      "SELECT id, target_lat, target_lng, radius, in_zone FROM location_targets WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No target location found" });
    }

    const target = result.rows[0];
    return res.json({
      id: target.id,
      targetLocation: {
        lat: target.target_lat,
        lng: target.target_lng,
        radius: target.radius
      },
      inZone: target.in_zone
    });

  } catch (err: any) {
    console.error("Get target error:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
});

router.post("/location-update", async (req: Request, res: Response) => {
  const { token, latitude, longitude } = req.body;

  // Input validation with more specific checks
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: "Invalid or missing token" });
  }
  
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ 
      error: "Invalid coordinates: latitude and longitude must be numbers" 
    });
  }

  // Basic coordinate validation
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ 
      error: "Invalid coordinates: latitude must be [-90, 90], longitude must be [-180, 180]" 
    });
  }

  try {
    // Get dependencies from app instance to avoid circular imports
    const pool = req.app.get("pool");
    const userSockets = req.app.get("userSockets");
    const io = req.app.get("io");

    if (!pool) {
      return res.status(500).json({ error: "Database connection not available" });
    }

    const decoded = verifyToken(token);
    const userId = decoded.id;

    const result = await pool.query(
      "SELECT id, target_lat, target_lng, radius, in_zone FROM location_targets WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No target location found for user" });
    }

    const target = result.rows[0];
    
    // Calculate distance
    const distance = getDistance(
      { latitude, longitude },
      { latitude: target.target_lat, longitude: target.target_lng }
    );
    
    const isInZone = distance <= target.radius;
    let statusChanged = false;

    // Handle zone entry
    if (isInZone && !target.in_zone) {
      await pool.query(
        "UPDATE location_targets SET in_zone = TRUE WHERE id = $1", 
        [target.id]
      );
      statusChanged = true;
      
      // Send alarm notification via socket
      if (userSockets && io) {
        const socketId = userSockets.get(userId);
        if (socketId) {
          io.to(socketId).emit("alarm", {
            type: "zone_entered",
            message: "You have arrived at your target location!",
            distance,
            timestamp: new Date().toISOString(),
          });
          console.log(`🚨 Alarm sent to user ${userId} at socket ${socketId}`);
        } else {
          console.log(`⚠️ No active socket found for user ${userId}`);
        }
      }
    } 
    // Handle zone exit
    else if (!isInZone && target.in_zone) {
      await pool.query(
        "UPDATE location_targets SET in_zone = FALSE WHERE id = $1", 
        [target.id]
      );
      statusChanged = true;
      console.log(`📍 User ${userId} left target zone (distance: ${distance}m)`);

      // Optional: Send exit notification
      if (userSockets && io) {
        const socketId = userSockets.get(userId);
        if (socketId) {
          io.to(socketId).emit("zone_exit", {
            type: "zone_exited",
            message: "You have left your target location",
            distance,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Log location update for debugging (you might want to remove this in production)
    console.log(`📍 Location update - User: ${userId}, Distance: ${distance}m, In Zone: ${isInZone}, Status Changed: ${statusChanged}`);

    return res.json({ 
      success: true,
      inZone: isInZone, 
      distance,
      statusChanged,
      userId,
      targetLocation: {
        lat: target.target_lat,
        lng: target.target_lng,
        radius: target.radius
      },
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    console.error("Location update error:", err);
    
    // Handle specific JWT errors
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: "Invalid token format" });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Token expired" });
    }
    
    // Handle database errors
    if (err.code) {
      console.error("Database error code:", err.code);
      return res.status(500).json({ error: "Database operation failed" });
    }
    
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;