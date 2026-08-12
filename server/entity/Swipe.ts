import type { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type SwipeDirection = 'like' | 'dislike';

@Entity()
@Unique('UNIQUE_USER_SWIPE', ['tmdbId', 'mediaType', 'user'])
@Index(['user', 'direction', 'createdAt'])
export class Swipe {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  public tmdbId: number;

  @Column({ type: 'varchar' })
  public mediaType: MediaType;

  @Column({ type: 'varchar' })
  public direction: SwipeDirection;

  @ManyToOne(() => User, (user) => user.swipes, { onDelete: 'CASCADE' })
  @Index()
  public user: User;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  constructor(init?: Partial<Swipe>) {
    Object.assign(this, init);
  }

  public static async recordSwipe({
    user,
    tmdbId,
    mediaType,
    direction,
  }: {
    user: User;
    tmdbId: number;
    mediaType: MediaType;
    direction: SwipeDirection;
  }): Promise<Swipe> {
    const swipeRepository = getRepository(Swipe);
    const existing = await swipeRepository.findOne({
      where: { tmdbId, mediaType, user: { id: user.id } },
    });

    const swipe =
      existing ?? new Swipe({ tmdbId, mediaType, user });
    swipe.direction = direction;

    return swipeRepository.save(swipe);
  }

  public static async getDislikedTmdbIds(
    user: User
  ): Promise<{ tmdbId: number; mediaType: MediaType }[]> {
    const swipeRepository = getRepository(Swipe);
    return swipeRepository.find({
      select: { tmdbId: true, mediaType: true },
      where: { user: { id: user.id }, direction: 'dislike' },
    });
  }

  public static async getSwipedTmdbIds(
    user: User
  ): Promise<{ tmdbId: number; mediaType: MediaType }[]> {
    const swipeRepository = getRepository(Swipe);
    return swipeRepository.find({
      select: { tmdbId: true, mediaType: true },
      where: { user: { id: user.id } },
    });
  }

  public static async getLikes(
    user: User,
    { offset = 0, limit = 20 }: { offset?: number; limit?: number }
  ): Promise<[Swipe[], number]> {
    const swipeRepository = getRepository(Swipe);
    return swipeRepository.findAndCount({
      where: { user: { id: user.id }, direction: 'like' },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });
  }

  public static async resetDislikes(user: User): Promise<number> {
    const swipeRepository = getRepository(Swipe);
    const result = await swipeRepository.delete({
      user: { id: user.id },
      direction: 'dislike',
    });
    return result.affected ?? 0;
  }
}
