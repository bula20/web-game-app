// Router relacji znajomych - lista, wysyłanie/akceptowanie/odrzucanie zaproszeń,
// usuwanie znajomych. Wszystkie endpointy wymagają zalogowania (authMiddleware) i
// goście dostają puste odpowiedzi / 403, bo nie mają persystencji znajomych.
import { Router, Request, Response } from 'express';
import { User } from '../models/User.js';
import { FriendRequest } from '../models/FriendRequest.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET / [auth] - lista przyjaciół z populacją podstawowych danych. Goście dostają [].
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (authReq.isGuest) {
      res.json([]);
      return;
    }
    const user = await User.findById(authReq.userId).populate('friends', 'username avatarPreset');
    res.json(user?.friends || []);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /request [auth, !guest] - wysłanie zaproszenia po nazwie usera. Sprawdzamy:
// (1) czy target istnieje, (2) czy nie próbujesz dodać siebie, (3) czy nie ma już
// zaproszenia w którąkolwiek stronę, (4) czy nie jesteście już znajomymi.
router.post('/request', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (authReq.isGuest) {
      res.status(403).json({ error: 'Guests cannot add friends' });
      return;
    }

    const { username } = req.body;
    const targetUser = await User.findOne({ username });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (targetUser._id.toString() === authReq.userId) {
      res.status(400).json({ error: 'Cannot add yourself as a friend' });
      return;
    }

    const existing = await FriendRequest.findOne({
      $or: [
        { from: authReq.userId, to: targetUser._id },
        { from: targetUser._id, to: authReq.userId },
      ],
    });

    if (existing) {
      res.status(400).json({ error: 'Friend request already exists' });
      return;
    }

    const currentUser = await User.findById(authReq.userId);
    if (currentUser?.friends.includes(targetUser._id)) {
      res.status(400).json({ error: 'Already friends' });
      return;
    }

    const request = await FriendRequest.create({ from: authReq.userId, to: targetUser._id });
    res.status(201).json(request);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /requests [auth] - skrzynka odbiorcza pending'ów z populacją "from".
router.get('/requests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (authReq.isGuest) {
      res.json([]);
      return;
    }

    const requests = await FriendRequest.find({ to: authReq.userId, status: 'pending' })
      .populate('from', 'username avatarPreset');
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /accept/:requestId [auth] - akceptacja zaproszenia. Po sukcesie dodajemy
// obu userów do friends[] $addToSet (zapobiega duplikatom przy retry'ach).
router.post('/accept/:requestId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const request = await FriendRequest.findById(req.params.requestId);
    if (!request || request.to.toString() !== authReq.userId) {
      res.status(404).json({ error: 'Friend request not found' });
      return;
    }

    if (request.status !== 'pending') {
      res.status(400).json({ error: 'Request already processed' });
      return;
    }

    request.status = 'accepted';
    await request.save();

    await User.findByIdAndUpdate(request.from, { $addToSet: { friends: request.to } });
    await User.findByIdAndUpdate(request.to, { $addToSet: { friends: request.from } });

    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /reject/:requestId [auth] - odrzucenie zaproszenia. Zaproszenie zostaje
// w bazie ze statusem rejected (żeby ten sam user nie spamował kolejnymi zaproszeniami).
router.post('/reject/:requestId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const request = await FriendRequest.findById(req.params.requestId);
    if (!request || request.to.toString() !== authReq.userId) {
      res.status(404).json({ error: 'Friend request not found' });
      return;
    }

    request.status = 'rejected';
    await request.save();
    res.json({ message: 'Friend request rejected' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:friendId [auth] - usunięcie znajomego z obu list. $pull bezpieczne na braku.
router.delete('/:friendId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    await User.findByIdAndUpdate(authReq.userId, { $pull: { friends: req.params.friendId } });
    await User.findByIdAndUpdate(req.params.friendId, { $pull: { friends: authReq.userId } });
    res.json({ message: 'Friend removed' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
