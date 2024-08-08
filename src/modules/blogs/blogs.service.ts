import * as SYS_MSG from '../../helpers/SystemMessages';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, MoreThanOrEqual, FindOptionsWhere } from 'typeorm';
import { Blog } from './entities/blog.entity';
import { User } from '../user/entities/user.entity';
import { CreateBlogDto } from './dtos/create-blog.dto';
import { UpdateBlogDto } from './dtos/update-blog.dto';
import { CustomHttpException } from '../../helpers/custom-http-filter';
import { BlogResponseDto } from './dtos/blog-response.dto';
import CustomExceptionHandler from '../../helpers/exceptionHandler';

@Injectable()
export class BlogService {
  constructor(
    @InjectRepository(Blog)
    private blogRepository: Repository<Blog>,
    @InjectRepository(User)
    private userRepository: Repository<User>
  ) {}

  private async fetchUserById(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['first_name', 'last_name'],
    });

    if (!user) {
      throw new CustomHttpException('User not found.', HttpStatus.NOT_FOUND);
    }

    return user;
  }

  async createBlog(createBlogDto: CreateBlogDto, user: User): Promise<BlogResponseDto> {
    const fullUser = await this.fetchUserById(user.id);

    const blog = this.blogRepository.create({
      ...createBlogDto,
      author: fullUser,
    });

    const savedBlog = await this.blogRepository.save(blog);

    return {
      blog_id: savedBlog.id,
      title: savedBlog.title,
      content: savedBlog.content,
      tags: savedBlog.tags,
      image_urls: savedBlog.image_urls,
      author: `${fullUser.first_name} ${fullUser.last_name}`,
      created_at: savedBlog.created_at,
    };
  }

  async getSingleBlog(blogId: string, user: User): Promise<any> {
    const singleBlog = await this.blogRepository.findOneBy({ id: blogId });
    const fullName = await this.fetchUserById(user.id);

    if (!singleBlog) {
      CustomExceptionHandler({
        response: SYS_MSG.BLOG_NOT_FOUND,
        status: 404,
      });
    }

    const { id, created_at, updated_at, ...rest } = singleBlog;
    const author = `${fullName.first_name} ${fullName.last_name}`;

    return {
      status: 200,
      message: SYS_MSG.BLOG_FETCHED_SUCCESSFUL,
      data: { blog_id: id, ...rest, author, published_date: created_at },
    };
  }

  async updateBlog(id: string, updateBlogDto: UpdateBlogDto, user: User): Promise<BlogResponseDto> {
    const blog = await this.blogRepository.findOne({
      where: { id },
      relations: ['author'],
    });

    if (!blog) {
      throw new CustomHttpException('Blog post not found.', HttpStatus.NOT_FOUND);
    }

    const fullUser = await this.fetchUserById(user.id);

    Object.assign(blog, updateBlogDto, { author: fullUser });

    const updatedBlog = await this.blogRepository.save(blog);

    return {
      blog_id: updatedBlog.id,
      title: updatedBlog.title,
      content: updatedBlog.content,
      tags: updatedBlog.tags,
      image_urls: updatedBlog.image_urls,
      author: `${updatedBlog.author.first_name} ${updatedBlog.author.last_name}`,
      created_at: updatedBlog.created_at,
    };
  }
  async deleteBlogPost(id: string): Promise<void> {
    const blog = await this.blogRepository.findOne({ where: { id } });
    if (!blog) {
      throw new CustomHttpException('Blog post with this id does not exist.', HttpStatus.NOT_FOUND);
    } else await this.blogRepository.remove(blog);
  }

  async getAllBlogs(page: number, pageSize: number): Promise<{ data: BlogResponseDto[]; total: number }> {
    const skip = (page - 1) * pageSize;

    const [result, total] = await this.blogRepository.findAndCount({
      skip,
      take: pageSize,
      relations: ['author'],
    });

    const data = this.mapBlogResults(result);
    return { data, total };
  }

  async searchBlogs(query: any): Promise<{ data: BlogResponseDto[]; total: number }> {
    const { page = 1, page_size = 10 } = query;
    const skip = (page - 1) * page_size;

    this.validateEmptyValues(query);

    const where: FindOptionsWhere<Blog> = this.buildWhereClause(query);

    const [result, total] = await this.blogRepository.findAndCount({
      where: Object.keys(where).length ? where : undefined,
      skip,
      take: page_size,
      relations: ['author'],
    });

    if (!result || result.length === 0) {
      CustomExceptionHandler({
        response: 'No results found for the provided search criteria',
        status: 404,
      });
      return { data: [], total: 0 };
    }

    const data = this.mapBlogResults(result);
    return { data, total };
  }

  private buildWhereClause(query: any): FindOptionsWhere<Blog> {
    const where: FindOptionsWhere<Blog> = {};

    if (query.author !== undefined) {
      where.author = {
        first_name: Like(`%${query.author}%`),
        last_name: Like(`%${query.author}%`),
      };
    }
    if (query.title !== undefined) {
      where.title = Like(`%${query.title}%`);
    }
    if (query.content !== undefined) {
      where.content = Like(`%${query.content}%`);
    }
    if (query.tags !== undefined) {
      where.tags = Like(`%${query.tags}%`);
    }
    if (query.created_date !== undefined) {
      where.created_at = MoreThanOrEqual(new Date(query.created_date));
    }

    return where;
  }

  private validateEmptyValues(query: any): void {
    for (const key in query) {
      if (query.hasOwnProperty(key) && query[key] !== undefined) {
        const value = query[key];
        if (typeof value === 'string' && !value.trim()) {
          CustomExceptionHandler({
            response: `${key.charAt(0).toUpperCase() + key.slice(1)} value is empty`,
            status: 400,
          });
        }
      }
    }
  }

  private mapBlogResults(result: Blog[]): BlogResponseDto[] {
    return result.map(blog => {
      if (!blog.author) {
        CustomExceptionHandler({
          response: 'Author not found',
          status: 500,
        });
      }
      const author_name = blog.author ? `${blog.author.first_name} ${blog.author.last_name}` : 'Unknown';
      return {
        blog_id: blog.id,
        title: blog.title,
        content: blog.content,
        tags: blog.tags,
        image_urls: blog.image_urls,
        author: author_name,
        created_at: blog.created_at,
      };
    });
  }
}
