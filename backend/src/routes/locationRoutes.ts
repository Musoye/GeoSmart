// Location Alarm Backend - routes/locationRoutes.ts

import express from "express";
import type { Request, Response } from "express";
import { verifyToken } from "../utils/jwt";
import { pool, userSockets } from "../index";
import { getDistance } from "geolib";

const router = express.Router();

router.get("/test", async (req: Request, res: Response) => {
    return res.status(200).json({ message: 'This is succesful'})
})

router.post("/location-update", async (req: Request, res: Response) => {
  const { token, latitude, longitude } = req.body;
  try {
    const decoded = verifyToken(token);
    const userId = decoded.id;

    const result = await pool.query(
      "SELECT id, target_lat, target_lng, radius, in_zone FROM location_targets WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "No target location" });

    const target = result.rows[0];
    const distance = getDistance(
      { latitude, longitude },
      { latitude: target.target_lat, longitude: target.target_lng }
    );
    const isInZone = distance <= target.radius;

    if (isInZone && !target.in_zone) {
      await pool.query("UPDATE location_targets SET in_zone = TRUE WHERE id = $1", [target.id]);
      const socketId = userSockets.get(userId);
      if (socketId) {
        req.app.get("io").to(socketId).emit("alarm", {
          message: "You have arrived at your target location!",
          distance,
        });
      }
    } else if (!isInZone && target.in_zone) {
      await pool.query("UPDATE location_targets SET in_zone = FALSE WHERE id = $1", [target.id]);
    }

    return res.json({ inZone: isInZone, distance });
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: "Invalid token" });
  }
});

export default router;