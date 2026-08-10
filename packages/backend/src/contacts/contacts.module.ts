import { Module } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { AudienceResolverService } from './audience-resolver.service';

@Module({
  controllers: [ContactsController],
  providers: [ContactsService, AudienceResolverService],
  exports: [ContactsService, AudienceResolverService],
})
export class ContactsModule {}
