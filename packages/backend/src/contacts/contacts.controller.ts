import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ImportContactsDto } from './dto/import-contacts.dto';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('tagId') tagId?: string,
    @Query('isFavorite') isFavorite?: string,
    @Query('isArchived') isArchived?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.contactsService.list(user.organizationId, {
      search,
      tagId,
      isFavorite: isFavorite === undefined ? undefined : isFavorite === 'true',
      isArchived: isArchived === undefined ? undefined : isArchived === 'true',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('tags')
  listTags(@CurrentUser() user: AuthenticatedUser) {
    return this.contactsService.listTags(user.organizationId);
  }

  @Post('tags')
  createTag(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { name: string; color?: string },
  ) {
    return this.contactsService.createTag(user.organizationId, body.name, body.color);
  }

  @Post('import')
  importCsv(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportContactsDto) {
    return this.contactsService.importCsv(user.organizationId, dto.csv);
  }

  @Post('bulk/tag')
  bulkAddTag(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { contactIds: string[]; tagId: string },
  ) {
    return this.contactsService.bulkAddTag(user.organizationId, body.contactIds, body.tagId);
  }

  @Post('bulk/archive')
  bulkArchive(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { contactIds: string[]; isArchived: boolean },
  ) {
    return this.contactsService.bulkSetArchived(user.organizationId, body.contactIds, body.isArchived);
  }

  @Post('bulk/delete')
  bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: { contactIds: string[] }) {
    return this.contactsService.bulkDelete(user.organizationId, body.contactIds);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contactsService.findOne(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateContactDto) {
    return this.contactsService.create(user.organizationId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.update(user.organizationId, id, dto);
  }

  @Patch(':id/favorite')
  setFavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { isFavorite: boolean },
  ) {
    return this.contactsService.setFavorite(user.organizationId, id, body.isFavorite);
  }

  @Patch(':id/archive')
  setArchived(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { isArchived: boolean },
  ) {
    return this.contactsService.setArchived(user.organizationId, id, body.isArchived);
  }

  @Patch(':id/opt-in')
  setOptIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { optedIn: boolean },
  ) {
    return this.contactsService.setOptIn(user.organizationId, id, body.optedIn);
  }

  @Post(':id/tags/:tagId')
  addTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('tagId') tagId: string,
  ) {
    return this.contactsService.addTag(user.organizationId, id, tagId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contactsService.remove(user.organizationId, id);
  }
}
