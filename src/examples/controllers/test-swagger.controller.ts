import { Controller, Get, Post, Swagger } from '../../core/decorators'

/**
 * Test controller to demonstrate controller-level Swagger metadata inheritance
 */
@Controller('/test-swagger')
@Swagger({
    tags: ['Test'],
    description: 'Test endpoints for Swagger metadata inheritance'
    // security: [{ apiKey: [] }]  // Temporarily commented out
})
export class TestSwaggerController {

    @Get('/inherit')
    // This method inherits: tags=['Test'], security=[{apiKey:[]}], description
    inheritFromController() {
        return { message: 'Inherits controller metadata' }
    }

    @Get('/override')
    @Swagger({
        summary: 'Override example',
        tags: ['Test', 'Override']  // Merges: ['Test', 'Override']
        // security: []  // Temporarily commented out
    })
    overrideControllerMetadata() {
        return { message: 'Overrides security, merges tags' }
    }

    @Post('/merge-tags')
    @Swagger({
        summary: 'Tag merging example',
        tags: ['Custom', 'API'],  // Final tags: ['Test', 'Custom', 'API']
        deprecated: true
    })
    mergeTagsExample() {
        return { message: 'Demonstrates tag merging' }
    }
}