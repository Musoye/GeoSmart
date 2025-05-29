import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";

const router = Router();

router.post("/login", (req: Request, res: Response) => {
  const { username } = req.body;
  const token = jwt.sign({ id: username }, process.env.JWT_SECRET!, {
    expiresIn: "1d",
  });
  res.json({ token });
});

export default router;
