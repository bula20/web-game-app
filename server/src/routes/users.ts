import { Router, Request, Response } from 'express';
import { User } from '../models/User.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Search users by username
router.get('/search', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const query = req.query.q as string;
    if (!query || query.length < 2) {
      res.status(400).json({ error: 'Search query must be at least 2 characters' });
      return;
    }

    const users = await User.find({
      username: { $regex: query, $options: 'i' },
      _id: { $ne: authReq.userId },
      isGuest: false,
    })
      .select('username')
      .limit(10);

    res.json(users);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select('username createdAt');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
