/** One resume in the sample pack, with the candidate it is loaded as. */
export interface PackResume {
  title: string;
  file_path: string;
  f_name: string;
  l_name: string;
  interview: string;
}

/** A pack resume with the text read from its PDF, ready to store. */
export interface PackResumeWithText extends PackResume {
  extracted_text: string;
}

/** What loading the pack into a class did: resumes added, and ones it already had. */
export interface PackLoad {
  added: number;
  alreadyLoaded: number;
}
