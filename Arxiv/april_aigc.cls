% %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% A new style for APRIL Lab pre-prints
% based on FAIR template
% Modified Version: 1.0
% ==> 1. by Jiangning Zhang, Feb. 14, 2026
% ==> 2. Website: https://zhangzjn.github.io/
% ==> 3. Google Scholar: https://scholar.google.com.hk/citations?user=2hA4X9wAAAAJ&hl=zh-CN
% %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% Class declarations %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{april_aigc}[2024/04/01 APRIL Lab Preprint Class]

% --- Option Handling ---

% Define a switch for numeric citations
\newif\if@numbib
\@numbibfalse % Default is false (Author-Year)

\DeclareOption{numbers}{\@numbibtrue}
\DeclareOption{authoryear}{\@numbibfalse}

% Pass all other options (like twocolumn, onecolumn, 10pt, etc.) to article
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{article}}

\ProcessOptions\relax
\LoadClass{article}

% Layout %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage[top=2.25cm, bottom=2.5cm, left=2.5cm, right=2.5cm, columnsep=0.65cm]{geometry}
\RequirePackage{microtype}
\RequirePackage{placeins}
\RequirePackage{hyphenat}
\RequirePackage{setspace}
\RequirePackage{parskip}
\RequirePackage[latin, english]{babel}
\RequirePackage{lipsum}
\RequirePackage{etoolbox}

\DisableLigatures[f]{family=sf*} 

% Graphics %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage{graphicx}
\RequirePackage{subcaption}

% Tables %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage{booktabs}
\RequirePackage{nicematrix}
\RequirePackage{multirow}
\RequirePackage{bm}
\newcommand{\nm}[1]{#1}

% Colorful stuff %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage[most]{tcolorbox}
\RequirePackage{xcolor}

% --- APRIL Branding Colors ---
% You can adjust these HEX codes to match APRIL Lab's branding
\definecolor{aprilblue}{HTML}{0064E0} % Main Brand Color
\definecolor{aprilfg}{HTML}{1C2B33}   % Foreground/Text Color
\definecolor{aprilbg}{HTML}{F1F4F7}   % Background Color for Title

% References %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage{hyperref}
\RequirePackage[noabbrev,nameinlink]{cleveref}

\hypersetup{
  colorlinks,
  linkcolor=aprilblue,
  citecolor=aprilblue,
  urlcolor=aprilblue
}

% --- Citation Logic ---
\if@numbib
    % If [numbers] option is used: style is [1], [2]
    \RequirePackage[numbers,sort&compress]{natbib}
    \bibliographystyle{plainnat} % or unsrtnat
\else
    % Default: style is Motamed et al. (2023)
    \RequirePackage[round,authoryear]{natbib}
    \bibliographystyle{plainnat}
\fi

\def\bibfont{\small}

% Section and caption format %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage{titlesec}
\titleformat*{\paragraph}{\itshape}
\titleformat*{\section}{\Large\sffamily\bfseries}
\titleformat*{\subsection}{\large\sffamily\bfseries}
\titleformat*{\subsubsection}{\normalsize\sffamily\bfseries}
\DeclareTextFontCommand{\textbf}{\bfseries\sffamily}

\RequirePackage{caption}
\DeclareCaptionLabelSeparator{custom}{}
\DeclareCaptionFormat{custom}{{\sffamily\textbf{#1 #2}} #3}
\captionsetup{singlelinecheck=false,format=custom,labelsep=custom,font=small}
\captionsetup[sub]{singlelinecheck=true,format=custom,labelsep=custom,font=small}

% Fonts %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\RequirePackage[T1]{fontenc}
\renewcommand*\ttdefault{cmvtt}

% NOTE: The original template used custom 'Optimistic' fonts. 
% To ensure this compiles for everyone, we use standard Helvetica/SourceSans.
% If you have the specific font files, uncomment the lines below and adjust paths.

% --- Safe Fallback ---
\RequirePackage{helvet}
\renewcommand{\sfdefault}{phv} 

% --- Original Custom Font Logic (Uncomment if you have assets/Optimistic.ttf) ---
% \DeclareFontFamily{T1}{optimistic}{}
% \DeclareFontShape{T1}{optimistic}{m}{n}{<-> s * [0.88] assets/optimistic}{}
% \DeclareFontShape{T1}{optimistic}{b}{n}{<-> s * [0.88] assets/optimistic}{}
% \pdfmapline{+optimistic < assets/Optimistic.ttf <T1-WGL4.enc}
% \renewcommand{\sfdefault}{optimistic}


% Authors, affiliations, infos %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\renewcommand\addtolist[5][]{
  \begingroup
    \if\relax#3\relax\def\sep{}\else\def\sep{#5}\fi
    \let\protect\@unexpandable@protect 
    \xdef#3{\expandafter{#3}\sep #4[#1]{#2}}%
  \endgroup
}

\newcommand\authorlist{}
\newcommand\authorformat[2][]{{\sffamily \bfseries #2$^{#1}$}}
\renewcommand\author[2][]{\addtolist[#1]{#2}{\authorlist}{\authorformat}{, }}

\newcommand\affiliationlist{}
\newcommand\affiliationformat[2][]{{\normalsize $^{#1}$#2}}
\newcommand\affiliation[2][]{\addtolist[#1]{#2}{\affiliationlist}{\affiliationformat}{, }}

\newcommand\contributionlist{}
\newcommand\contributionformat[2][]{{\small $^{#1}$#2}}
\newcommand\contribution[2][]{\addtolist[#1]{#2}{\contributionlist}{\contributionformat}{, }}

\newcommand\metadatalist{}
\newcommand\metadataformat[2][]{{\small {\sffamily \bfseries #1:} #2}}
\newcommand\metadata[2][]{\addtolist[#1]{#2}{\metadatalist}{\metadataformat}{\par}}

\renewcommand{\abstract}[1]{\def\abstractlist{{\color{aprilfg} #1}}}
\newcommand{\email}[1]{\href{mailto:#1}{\texttt{#1}}}

% \renewcommand\date[1]{\metadata[Date]{#1}}
% \newcommand\correspondence[1]{\metadata[Correspondence]{#1}}


% ========================================================================
% [NEW] Enhanced Metadata with Icons
% ========================================================================

% Helper macro to safely load icons (prevents crash if icon is missing)
\newcommand{\icon}[1]{%
  \IfFileExists{#1}%
  {\raisebox{-0.1em}{\includegraphics[height=1em]{#1}}}%
  {}%
}

% 1. Date
\newcommand\coverdate[1]{\metadata[\icon{assets/icons8-date-96.png} Date]{#1}}

% 2. Code / Project / Demo / Data / Model
% \newcommand\coversourcecode[1]{\metadata[\icon{assets/github.png} Code]{\url{#1}}}
\newcommand\coversourcecode[1]{\metadata[\icon{assets/icons8-github-100.png} Code]{\url{#1}}}
\newcommand\coverproject[1]{\metadata[\icon{assets/icons8-website-100.png} Project]{\url{#1}}}
\newcommand\coverdemo[1]{\metadata[\icon{assets/icons8-youtube-100.png} Demo]{\url{#1}}}
\newcommand{\coverdatasetmodelscope}[1]{\metadata[\icon{assets/modelscope.png} Data]{\url{#1}}}
% \newcommand{\coverdataset}[1]{\metadata[\icon{assets/huggingface-color.png} Data]{\url{#1}}}
% \newcommand{\covermodel}[1]{\metadata[\icon{assets/huggingface-color.png} Model]{\url{#1}}}
\newcommand{\coverdataset}[1]{\metadata[\icon{assets/icons8-hugging-face-100.png} Data]{\url{#1}}}
\newcommand{\covermodel}[1]{\metadata[\icon{assets/icons8-hugging-face-100.png} Model]{\url{#1}}}


% 3. Correspondence
\newcommand\covercorrespondence[1]{\metadata[\icon{assets/icons8-email-96.png} Correspondence]{\texttt{#1}}}

% 4. Paper Type
\newcommand\papertype[1]{\metadata[Type]{#1}}

% ========================================================================


\renewcommand{\title}[1]{\newcommand{\titlelist}{{\huge\sffamily\bfseries #1}}}

\newcommand{\beginappendix}{\appendix{\huge\sffamily Appendix\par}}

% Titlebox %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\newcommand{\mymaketitle}{%
  \tcbset{enhanced,frame hidden}
  \tcbset{left=0.5cm}
  \tcbset{right=0.5cm}
  \tcbset{top=0.5cm}
  \tcbset{bottom=0.5cm}
  \tcbset{arc=10pt}
  \tcbset{colback=aprilbg}
  \tcbset{before skip=0pt}
  \tcbset{grow to left by=1.5pt}
  \tcbset{grow to right by=1.5pt}
  \tcbset{overlay={\node[
    anchor=south east,
    at= (frame.south east),
    xshift=-0.5cm,
    yshift=0.5cm] {%
      % Check if logo exists, otherwise skip to prevent crash
      \IfFileExists{assets/april_logo1.png}
      {\includegraphics[width=2.6cm]{assets/april_logo1.png}}
      {\IfFileExists{assets/april_logo1.png}
         {\includegraphics[width=2.6m]{assets/april_logo1.png}}
         {\textbf{APRIL}} % Fallback text
      }
    };}}
  % 
  \begin{tcolorbox}
    \setlength{\parindent}{0cm}
    \setlength{\parskip}{0.5cm}
    {
      \setlength{\parskip}{0cm}
      \raggedright
      \nohyphens
      %
      {
        \setstretch{1.618}
        \titlelist\par
      }
      \vskip 0.2cm
      %
      \authorlist\par
      \vskip 0.2cm
      %
      \affiliationlist\par
      %
      \contributionlist\par
    }
    %
    \abstractlist\par
    %
    \vskip 0.5cm
    %
    {
      \setlength{\parskip}{0cm}
      \ifdefempty{\metadatalist}{\vspace*{0.65cm}}{\metadatalist\par}
    }
  \end{tcolorbox}
  \tcbset{reset}
  \FloatBarrier
}

\if@twocolumn%
\renewcommand{\maketitle}{
\twocolumn[%
  \mymaketitle
  \vskip 0.38cm
]
}%
\else%
\renewcommand{\maketitle}{
  \mymaketitle
}%
\fi