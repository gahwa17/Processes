// controllers/userController.ts
import { Request, Response } from "express";
import { userService, UserService } from "@src/services/userService";
import { eventService, EventService } from "@src/services/eventService";
import { IUserDocument } from "@src/models/user";
import { Types } from 'mongoose';
import { Redis } from "ioredis";
import redisClient from "@src/config/redis";
export class UserController {
  constructor(private userService: UserService, private eventService: EventService, private redisClient: Redis) { }

  // 獲取用戶資料
  getUserProfile = async (req: Request, res: Response): Promise<void> => {
    const requested_userId = req.params.userId;
    const redisKey = `userProfile:${requested_userId}`;
    try {
      const cachedData = await this.redisClient.get(redisKey);
      if (cachedData) {
        // 有快取，直接使用快取資料
        const userData = JSON.parse(cachedData);
        res.status(200).json(userData);
        return;
      }
      const requestedUser = await this.userService.findUserById(requested_userId);
      if (!requestedUser) {
        res.status(404).json({ msg: "使用者不存在" });
        return;
      }
      const publicFields = {
        _id: requestedUser._id,
        accountName: requestedUser.accountName,
        userName: requestedUser.userName,
        bio: requestedUser.bio,
        avatarUrl: requestedUser.avatarUrl,
        followersCount: requestedUser.followersCount,
        followingCount: requestedUser.followingCount,
      };
      await this.redisClient.setex(redisKey, 600, JSON.stringify(publicFields));

      res.status(200).json(publicFields);
    } catch (err) {
      console.error(err);
      res.status(500);
    }
  }

  // 更新用戶資料
  updateUserProfile = async (req: Request, res: Response): Promise<void> => {
    const user = req.user as IUserDocument;
    const { userName, email, isPublic, bio } = req.body;
    const avatarUrl = req.files
      ? (req.files as Express.MulterS3.File[]).map(file => file.location)
      : [];
    try {
      const updatedUser = await this.userService.updateUserProfile(user, {
        userName,
        email,
        isPublic,
        bio,
        avatarUrl: avatarUrl[0],
      });
      if (!updatedUser) {
        res.status(404).json({ msg: "用户不存在" });
        return;
      }
      const publicFields = {
        _id: updatedUser._id,
        accountName: updatedUser.accountName,
        userName: updatedUser.userName,
        bio: updatedUser.bio,
        avatarUrl: updatedUser.avatarUrl,
        followersCount: updatedUser.followersCount,
        followingCount: updatedUser.followingCount,
      };
      const redisKey = `userProfile:${updatedUser._id}`;
      await this.redisClient.setex(redisKey, 600, JSON.stringify(publicFields));
      // 刪除貼文快取
      await this.redisClient.del(`user:${updatedUser._id.toString()}:posts`);
      res.json({ msg: "使用者資料已更新", user: updatedUser.toObject() });
    } catch (err) {
      console.error(err);
      res.status(500);
    }
  }

  // 關注用戶
  followUser = async (req: Request, res: Response): Promise<void> => {
    const user = req.user as IUserDocument;
    const { userId } = req.body as { userId: string };
    try {
      const followedId = new Types.ObjectId(userId);
      const result = await this.userService.followUser(user._id, followedId);
      if (!result) {
        res.status(404).json({ msg: "找不到或已經追蹤該使用者" });
        return;
      }
      await this.eventService.createEvent(user._id, followedId);
        res.status(200).json({ msg: "成功追蹤使用者" });
    } catch (err) {
      console.error(err);
      res.status(500);
    }
  }

  // 取消關注用戶
  unfollowUser = async (req: Request, res: Response): Promise<void> => {
    const user = req.user as IUserDocument;
    const { userId } = req.body as { userId: string };
    const followedId = new Types.ObjectId(userId);
    try {
      const result = await this.userService.unfollowUser(user._id, followedId);
      if (!result) {
        res.status(404).json({ msg: "找不到或尚未追蹤該使用者" });
        return;
      }
      res.status(200).json({ msg: "成功取消追蹤使用者" });
    } catch (err) {
      console.error(err);
      res.status(500);
    }
  }

  // 接受用戶追隨
  acceptFollowRequest = async (req: Request, res: Response): Promise<void> => {
    const user = req.user as IUserDocument;
    const { userId } = req.body as { userId: string };
    const followerId = new Types.ObjectId(userId);
    try {
      const result = await this.userService.acceptFollowRequest(user._id, followerId);
      if (!result) {
        res.status(404).json({ msg: "找不到或尚未追蹤該使用者" });
        return;
      }
      res.status(200).json({ msg: "成功接受追蹤" });
    } catch (err) {
      console.error(err);
      res.status(500);
    }
  }

  // 拒絕用戶追隨
  rejectFollowRequest = async (req: Request, res: Response): Promise<void> => {
    const user = req.user as IUserDocument;
    const { userId } = req.body as { userId: string };
    const followerId = new Types.ObjectId(userId);
    try {
      const result = await this.userService.rejectFollowRequest(user._id, followerId);
      if (!result) {
        res.status(404).json({ msg: "找不到或尚未追蹤該使用者" });
        return;
      }
      res.status(200).json({ msg: "已拒絕追蹤" });
    } catch (err) {
      console.error(err);
      res.status(500);
    }
  }
}

// 預設導出一個實例，方便直接使用
export const userController = new UserController(userService, eventService, redisClient);
