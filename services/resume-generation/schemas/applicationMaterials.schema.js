const {
  applicationMaterialsSchema,
  coverLetterSchema,
} = require('../../llm/schemas/resumeSchemas')

const ApplicationMaterialsSchema = applicationMaterialsSchema
const CoverLetterSchema = coverLetterSchema

module.exports = {
  ApplicationMaterialsSchema,
  CoverLetterSchema,
}
